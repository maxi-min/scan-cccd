import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

function getAppRoot(): string {
  return process.env.APP_ROOT || process.cwd();
}

function getEnvFilePath(): string {
  if (process.env.USER_ENV_PATH) return process.env.USER_ENV_PATH;
  return path.join(getAppRoot(), ".env");
}

dotenv.config({ path: getEnvFilePath() });

const app = express();
const PORT = 3000;

// Set body parser limits for large image payloads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Lazy initializer for Gemini client to prevent crash if key is initially missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not defined in the environment variables. Please configure the Gemini API key in Secrets Settings.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// REST API root health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "CCCD OCR and Google Sheets API is running" });
});

// Endpoint: Scan CCCD Image base64 and extract structured JSON using Gemini
app.post("/api/scan", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "No image base64 data provided" });
    }

    // Dynamically retrieve actual MIME type from data-uri header if present, otherwise default to jpeg
    let imageMime = "image/jpeg";
    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
    if (mimeMatch) {
      imageMime = mimeMatch[1];
    }
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");

    const ai = getGeminiClient();

    // Query template structured instruction
    const prompt = `Analyze this image of a Vietnamese National Identity Card (CCCD - Căn cước công dân). 
The card can be either the FRONT side or the BACK side. Extract any key fields carefully with high accuracy. If some fields are unreadable or missing, put null.

Fields to extract:
1. idNumber: 12-digit number (Số căn cước công dân / Số CCCD. e.g. "036094001234").
2. fullName: Full Name in upper case with markings, e.g., "NGUYỄN VĂN A".
3. dob: Date of birth (Ngày sinh) strictly formatted as DD/MM/YYYY, e.g., "15/08/1995".
4. gender: Gender (Giới tính, e.g. "Nam" or "Nữ").
5. nationality: Nationality (Quốc tịch, e.g. "Việt Nam").
6. placeOfOrigin: Place of origin / birthplace (Quê quán, e.g., "Hải Hậu, Nam Định").
7. placeOfResidence: Place of residence (Nơi thường trú, e.g., "P. Cát Linh, Q. Đống Đa, Hà Nội").
8. oldId: Old ID card number (Số CMND 9 số hoặc CCCD mã vạch cũ) if detectable, null otherwise. It is a sequence of 9 or 12 digits (e.g., "123456789"), consisting ONLY of numbers and NO slashes.
9. issueDate: Issue date of the card (Ngày cấp) formatted strictly as DD/MM/YYYY. It MUST be a calendar date containing slashes (e.g., "25/11/2021"). Never put a card ID number or digits-only sequence in this field.

QR CODE AND DATE SPECIFICATION:
- IMPORTANT TIP FOR FRONT SIDE: There is a QR code on the top-right corner of the FRONT side. If present, decode/read its content. The decoded text contains exactly 7 pipe-separated segments:
  \`ID_Number|Old_ID_Card|Full_Name|Date_Of_Birth|Gender|Address|Issue_Date\`
  Example QR structure: "038095012345||NGUYỄN VĂN A|15081995|Nam|P. Cát Linh...|25112021" or "038095012345|123456789|NGUYỄN VĂN A|15081995|Nam|P. Cát Linh...|25112021"
  Note that:
  - segment 1 (ID_Number) maps to \`idNumber\`
  - segment 2 (Old_ID_Card) is the old ID card number and maps to \`oldId\` (or null if empty)
  - segment 7 (Issue_Date) is the card issue date in DDMMYYYY format (e.g., "25112021" means "25/11/2021"). It MUST be reformatted to DD/MM/YYYY and mapped to \`issueDate\`. DO NOT confuse segment 2 with segment 7! Segment 2 is a card number like "123456789", whereas segment 7 is the issue date like "25/11/2021".
- IMPORTANT TIP FOR BACK SIDE: If the image is the BACK side, you can find the date of issue (Ngày cấp) written in a sentence like "Ngày ... tháng ... năm ..." (e.g. "Ngày 21 tháng 05 năm 2021" is "21/05/2021"). You can also find the fingerprint and a stamp. Search for this date text at the bottom.
Ensure spelling is correct according to Vietnamese characters in the card image.`;

    const requestParams = {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: imageMime,
              data: cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            idNumber: { type: Type.STRING, description: "Số CCCD (12 chữ số)" },
            fullName: { type: Type.STRING, description: "Họ và tên viết hoa có dấu" },
            dob: { type: Type.STRING, description: "Ngày sinh định dạng DD/MM/YYYY" },
            gender: { type: Type.STRING, description: "Giới tính (Nam hoặc Nữ)" },
            nationality: { type: Type.STRING, description: "Quốc tịch" },
            placeOfOrigin: { type: Type.STRING, description: "Quê quán" },
            placeOfResidence: { type: Type.STRING, description: "Nơi thường trú" },
            oldId: { type: Type.STRING, description: "Số CMND/CCCD cũ (nếu có)" },
            issueDate: { type: Type.STRING, description: "Ngày cấp (DD/MM/YYYY)" },
          },
          required: [],
        },
      },
    };

    // Helper functions for retry & model fallback
    const executeWithFallbackAndRetry = async () => {
      const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
      let lastError: any = null;

      for (const currentModel of modelsToTry) {
        let delay = 1000;
        const maxRetries = 2; // Try up to 2 retries per model

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`[OCR] Querying ${currentModel} (Attempt ${attempt}/${maxRetries})...`);
            const response = await ai.models.generateContent({
              model: currentModel,
              ...requestParams,
            });
            return response;
          } catch (error: any) {
            lastError = error;
            const errStr = String(error.message || error);
            console.warn(`[OCR] Error with model ${currentModel} on attempt ${attempt}:`, errStr);

            // Check if it's a transient failure (503 Service Unavailable, RESOURCE_EXHAUSTED or overloaded status)
            const isTransient = 
              errStr.includes("503") || 
              errStr.includes("UNAVAILABLE") || 
              errStr.includes("high demand") || 
              errStr.includes("overloaded") || 
              errStr.includes("RESOURCE_EXHAUSTED") ||
              error.status === 503 ||
              error.statusCode === 503;

            if (isTransient && attempt < maxRetries) {
              console.log(`[OCR] Transient error identified. Backing off for ${delay}ms...`);
              await new Promise((resolve) => setTimeout(resolve, delay));
              delay *= 2; // exponential backoff
            } else {
              // Non-transient or final attempt for this model, break to hop to fallback model
              break;
            }
          }
        }
      }

      throw lastError || new Error("Failed to extract data using all available models");
    };

    const response = await executeWithFallbackAndRetry();

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Không nhận được kết quả phân tích văn bản từ mô hình AI.");
    }

    const parsedData = JSON.parse(textOutput.trim());
    res.json(parsedData);
  } catch (err: any) {
    console.error("Scanning API Error:", err);
    res.status(500).json({ error: err.message || "Failed to parse CCCD image" });
  }
});

// Endpoint: Append to Google Sheet (proxied to avoid exposing sheets logic / API restrictions to front end if using client tokens)
app.post("/api/sheets/append", async (req, res) => {
  try {
    const { connectionMethod, scriptUrl, spreadsheetId, sheetName, accessToken, values, rawInfo } = req.body;

    if (connectionMethod === "script") {
      if (!scriptUrl) {
        return res.status(400).json({ error: "Thiếu đường dẫn Web App Google Apps Script (scriptUrl)." });
      }

      // Format payload for Google Apps Script Web App
      const payload = {
        spreadsheetId,
        sheetName,
        idNumber: rawInfo?.idNumber || values?.[0] || "",
        fullName: rawInfo?.fullName || values?.[1] || "",
        dob: rawInfo?.dob || values?.[2] || "",
        gender: rawInfo?.gender || values?.[3] || "",
        placeOfOrigin: rawInfo?.placeOfOrigin || values?.[4] || "",
        placeOfResidence: rawInfo?.placeOfResidence || values?.[5] || "",
        issueDate: rawInfo?.issueDate || values?.[6] || "",
        timestamp: values?.[7] || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
      };

      const forwardRes = await fetch(scriptUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!forwardRes.ok) {
        const errText = await forwardRes.text();
        return res.status(forwardRes.status).json({ error: `Google Apps Script lỗi mạng: ${errText}` });
      }

      const scriptJson = await forwardRes.json();
      if (scriptJson.status === "error") {
        return res.status(500).json({ error: `Google Apps Script xử lý lỗi: ${scriptJson.error}` });
      }

      return res.json({ success: true, message: "Lưu thành công bằng Google Apps Script!", details: scriptJson });
    }

    if (!spreadsheetId) {
      return res.status(400).json({ error: "Missing spreadsheetId" });
    }
    if (!accessToken) {
      return res.status(401).json({ error: "Missing Google Sheets Authorization Token. Please authenticate or provide active Access Token." });
    }

    const sheetRange = sheetName || "Sheet1";
    
    // First, check if the sheet is empty to write headers
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetRange)}?valueRenderOption=FORMATTED_VALUE`;
    
    let isSheetEmpty = false;
    let existingLength = 0;
    try {
      const getRes = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (getRes.status === 404) {
        throw new Error("Spreadsheet not found or Sheet Name does not exist.");
      }
      const getData = await getRes.json();
      if (!getData.values || getData.values.length === 0) {
        isSheetEmpty = true;
      } else {
        existingLength = getData.values.length;
      }
    } catch (e) {
      // If table doesn't exist or other error, let's proceed to append anyway
      console.warn("Could not fetch old table contents (might be newly created):", e);
    }

    // Standard headers
    const EXPECTED_HEADERS = [
      "STT",
      "Số CCCD", 
      "Họ và tên", 
      "Ngày sinh", 
      "Giới tính", 
      "Quê quán", 
      "Nơi thường trú", 
      "Ngày cấp",
      "Thời gian quét"
    ];

    if (isSheetEmpty) {
      // First append headers
      const appendHeaderUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetRange)}:append?valueInputOption=USER_ENTERED`;
      await fetch(appendHeaderUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [EXPECTED_HEADERS],
        }),
      });
    }

    // Prepend STT sequence number (if sheet is empty, first index is 1. If not empty, it has existingLength rows which already includes headers and previous records, so index is existingLength)
    const stt = isSheetEmpty ? 1 : existingLength;
    const finalRowValues = [stt, ...values];

    // Now append row values
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetRange)}:append?valueInputOption=USER_ENTERED`;
    const appendRes = await fetch(appendUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [finalRowValues],
      }),
    });

    if (!appendRes.ok) {
      const errorText = await appendRes.text();
      return res.status(appendRes.status).json({ error: `Google Sheets error: ${errorText}` });
    }

    const appendData = await appendRes.json();
    res.json({ success: true, message: "Successfully appended data to sheet!", details: appendData });
  } catch (err: any) {
    console.error("Sheets API Error:", err);
    res.status(500).json({ error: err.message || "Failed to update Google Sheet" });
  }
});

// Server boot with Vite middleware
export async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(getAppRoot(), "dist");
    app.use(express.static(distPath));
    // Support React router / SPA routing
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[OCR-SHEETS-SERVER] running on http://localhost:${PORT}`);
  });
}

if (!process.versions.electron) {
  startServer();
}
