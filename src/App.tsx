import React, { useState, useRef, useEffect } from "react";
import { 
  Camera, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  Settings, 
  Database, 
  Calendar, 
  User, 
  MapPin, 
  CreditCard, 
  Globe, 
  Sparkles, 
  History, 
  ExternalLink, 
  FileSpreadsheet, 
  HelpCircle,
  RefreshCw,
  Trash2,
  Lock,
  ChevronRight,
  QrCode,
  Download,
  Copy,
  Monitor
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { CCCDInfo, SheetsConfig, ScanLog } from "./types";

const DEFAULT_CONFIG: SheetsConfig = {
  spreadsheetId: "",
  sheetName: "Trang_Tinh_1",
  accessToken: "",
  connectionMethod: "script",
  scriptUrl: ""
};

const GOOGLE_APPS_SCRIPT_CODE = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var spreadsheetId = data.spreadsheetId || "ĐIỀN_ID_BẢNG_TÍNH_CỦA_BẠN_VÀO_ĐÂY";
    var sheetName = data.sheetName || "Sheet1";
    
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.getSheets()[0] || ss.insertSheet(sheetName);
    }
    
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["STT", "Số CCCD", "Họ và tên", "Ngày sinh", "Giới tính", "Quê quán", "Nơi thường trú", "Ngày cấp", "Thời gian quét"]);
    }
    
    var stt = sheet.getLastRow();
    
    var row = [
      stt,
      data.idNumber || "",
      data.fullName || "",
      data.dob || "",
      data.gender || "",
      data.placeOfOrigin || "",
      data.placeOfResidence || "",
      data.issueDate || "",
      data.timestamp || ""
    ];
    
    sheet.appendRow(row);
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", stt: stt }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

export default function App() {
  // Input image states
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // OCR processing states
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  
  // Extracted information state
  const [extractedInfo, setExtractedInfo] = useState<CCCDInfo | null>(null);
  
  // Google Sheets configuration state
  const [sheetsConfig, setSheetsConfig] = useState<SheetsConfig>(() => {
    try {
      const saved = localStorage.getItem("cccd_sheets_config");
      return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [sheetsStatus, setSheetsStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  // Scan logs/history
  const [scanHistory, setScanHistory] = useState<ScanLog[]>(() => {
    try {
      const saved = localStorage.getItem("cccd_scan_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // UI state for helper modal
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [helpTab, setHelpTab] = useState<"script" | "token">("script");
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [showExeBuildModal, setShowExeBuildModal] = useState<boolean>(false);

  // States for CCCD QR code generator
  const [copiedQr, setCopiedQr] = useState<boolean>(false);
  const [downloadingQr, setDownloadingQr] = useState<boolean>(false);

  // Copy raw QR string to clipboard
  const copyQrString = (qrString: string) => {
    navigator.clipboard.writeText(qrString).then(() => {
      setCopiedQr(true);
      setTimeout(() => setCopiedQr(false), 2000);
    }).catch(err => {
      console.error("Clipboard copy failed:", err);
    });
  };

  // Download QR Code PNG image dynamically
  const downloadQrCode = async (qrString: string, fullName: string) => {
    setDownloadingQr(true);
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=20&data=${encodeURIComponent(qrString)}`;
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `QR_CCCD_${(fullName || "card").toUpperCase().replace(/\s+/g, "_")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download QR failed:", err);
      alert("Không thể tải ảnh QR trực tiếp. Bạn có thể lưu thủ công bằng cách ấn đúp/click chuột phải vào ảnh QR để lưu.");
    } finally {
      setDownloadingQr(false);
    }
  };

  // HTML5 Video & Canvas References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Save Config to localStorage
  useEffect(() => {
    localStorage.setItem("cccd_sheets_config", JSON.stringify(sheetsConfig));
  }, [sheetsConfig]);

  // Save Scan History to localStorage
  useEffect(() => {
    localStorage.setItem("cccd_scan_history", JSON.stringify(scanHistory));
  }, [scanHistory]);

  // Monitor camera stream mounting
  useEffect(() => {
    let stream: MediaStream | null = null;

    if (isCameraActive) {
      setCameraError(null);
      navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: "environment", 
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      })
      .then((mediaStream) => {
        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(e => {
            console.error("Video play failed:", e);
          });
        }
      })
      .catch((err) => {
        console.error("Camera access error:", err);
        setCameraError("Không thể truy cập camera. Vui lòng cấp quyền camera trong khung duyệt hoặc tải ảnh lên từ tệp tin.");
        setIsCameraActive(false);
      });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isCameraActive]);

  // Start Camera handler
  const enableCamera = () => {
    setImageUri(null);
    setIsCameraActive(true);
  };

  // Close Camera handler
  const disableCamera = () => {
    setIsCameraActive(false);
  };

  // Capture image helper
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    if (ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      // Mirror if it were front facing, but standard environment is non-mirrored
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      setImageUri(dataUrl);
      disableCamera();

      // Trigger auto OCR
      triggerOcr(dataUrl);
    }
  };

  // Device File Input Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageUri(reader.result);
        disableCamera();
        
        // Trigger auto OCR
        triggerOcr(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Execute OCR endpoint call
  const triggerOcr = async (base64Payload: string) => {
    setIsScanning(true);
    setScanError(null);
    setSheetsStatus({ type: "idle", message: "" });

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64Payload,
          mimeType: "image/jpeg"
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Gặp lỗi máy chủ khi giải mã ảnh.");
      }

      const parsedCccd: CCCDInfo = await response.json();
      
      // Smart merge: Keep previously scanned fields if the new scan doesn't provide them
      setExtractedInfo(prev => {
        if (!prev) return parsedCccd;
        const merged = { ...prev };
        for (const k in parsedCccd) {
          const key = k as keyof CCCDInfo;
          if (parsedCccd[key] !== null && parsedCccd[key] !== undefined && parsedCccd[key] !== "") {
            merged[key] = parsedCccd[key] as any;
          }
        }
        return merged;
      });
    } catch (err: any) {
      console.error(err);
      setScanError(err.message || "Không thể kết nối đến máy chủ hoặc API Gemini bị lỗi. Vui lòng thử lại!");
    } finally {
      setIsScanning(false);
    }
  };

  // Handle Edit Input Changes
  const handleFieldChange = (key: keyof CCCDInfo, value: string) => {
    if (!extractedInfo) return;
    setExtractedInfo({
      ...extractedInfo,
      [key]: value
    });
  };

  // Write to Google Sheet handler
  const handleSaveToSheets = async () => {
    if (!extractedInfo) return;

    const isScript = sheetsConfig.connectionMethod === "script";

    if (isScript) {
      if (!sheetsConfig.scriptUrl) {
        setSheetsStatus({
          type: "error",
          message: "Cần điền đầy đủ Đường dẫn Google Apps Script Web App trong mục Cấu hình Google Sheet."
        });
        setShowConfig(true);
        return;
      }
    } else {
      if (!sheetsConfig.spreadsheetId || !sheetsConfig.accessToken) {
        setSheetsStatus({
          type: "error",
          message: "Cần điền đầy đủ Spreadsheet ID và Access Token trong mục Cấu hình Google Sheet."
        });
        setShowConfig(true);
        return;
      }
    }

    setSheetsStatus({ type: "loading", message: "Đang lưu dữ liệu vào Google Sheet..." });

    try {
      // Structure row value (excluding STT since server prepends it automatically)
      // ["Số CCCD", "Họ và tên", "Ngày sinh", "Giới tính", "Quê quán", "Nơi thường trú", "Ngày cấp", "Thời gian quét"]
      const cleanDateString = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      const rowValues = [
        extractedInfo.idNumber || "",
        extractedInfo.fullName || "",
        extractedInfo.dob || "",
        extractedInfo.gender || "",
        extractedInfo.placeOfOrigin || "",
        extractedInfo.placeOfResidence || "",
        extractedInfo.issueDate || "",
        cleanDateString
      ];

      const response = await fetch("/api/sheets/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionMethod: sheetsConfig.connectionMethod || "script",
          scriptUrl: sheetsConfig.scriptUrl,
          spreadsheetId: sheetsConfig.spreadsheetId,
          sheetName: sheetsConfig.sheetName || "Sheet1",
          accessToken: sheetsConfig.accessToken,
          values: rowValues,
          rawInfo: {
            idNumber: extractedInfo.idNumber || "",
            fullName: extractedInfo.fullName || "",
            dob: extractedInfo.dob || "",
            gender: extractedInfo.gender || "",
            placeOfOrigin: extractedInfo.placeOfOrigin || "",
            placeOfResidence: extractedInfo.placeOfResidence || "",
            issueDate: extractedInfo.issueDate || ""
          }
        })
      });

      const resJson = await response.json();

      if (!response.ok) {
        throw new Error(resJson.error || "Lỗi lưu tệp google sheets.");
      }

      setSheetsStatus({
        type: "success",
        message: "Lưu thành công thông tin vào Google Sheet!"
      });

      // Add to log list
      const newLog: ScanLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: cleanDateString,
        info: { ...extractedInfo },
        status: "success"
      };
      setScanHistory([newLog, ...scanHistory]);

    } catch (err: any) {
      console.error(err);
      setSheetsStatus({
        type: "error",
        message: err.message || "Gặp sự cố khi đẩy thông tin lên Google Sheet. Kiểm tra lại Auth Token và Spreadsheet ID."
      });
    }
  };

  // Drag and drop events logic
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setImageUri(reader.result);
          disableCamera();
          triggerOcr(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const clearHistory = () => {
    if (window.confirm("Bạn có chắc chắn muốn xoá toàn bộ lịch sử quét CCCD? Dữ liệu trên Google Sheet vẫn sẽ giữ nguyên.")) {
      setScanHistory([]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Decorative Top Accent Bar */}
      <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 w-full" />

      {/* Header section with responsive visual styling */}
      <header className="bg-white border-b border-slate-200 py-4 px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-emerald-500 to-teal-600 p-2.5 rounded-xl text-white shadow-sm shadow-emerald-200">
            <CreditCard id="app-logo-icon" className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Quét CCCD thông minh <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">Auto OCR</span>
            </h1>
            <p className="text-xs text-slate-600 tracking-wide mt-0.5">Trích xuất Căn cước công dân và lưu trực tiếp vào Google Sheets</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => setShowExeBuildModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition"
          >
            <Monitor className="w-4 h-4 text-indigo-500" />
            Đóng gói App.exe
          </button>

          <button 
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition"
          >
            <HelpCircle className="w-4 h-4 text-slate-500" />
            Hướng dẫn thiết lập Sheet
          </button>
          
          <button 
            onClick={() => setShowConfig(!showConfig)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              showConfig 
              ? "bg-slate-800 text-white hover:bg-slate-900" 
              : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            <Settings className={`w-4 h-4 ${showConfig ? "animate-spin" : ""}`} />
            {showConfig ? "Đóng cấu hình Sheet" : "Cấu hình Google Sheet"}
          </button>
        </div>
      </header>

      {/* Main Single-View responsive container */}
      <main className="max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Dynamic Sheets Config Drawer/Section */}
        <AnimatePresence>
          {showConfig && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:col-span-12 overflow-hidden bg-emerald-900/5 border border-emerald-500/20 rounded-2xl p-5 md:p-6"
            >
              <div className="flex items-start justify-between gap-4 border-b border-emerald-950/10 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-base">Cấu hình liên kết Google Sheets</h3>
                </div>
                <div className="text-[10px] bg-emerald-600/10 text-emerald-800 px-2.5 py-1 rounded-md font-mono flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Được lưu an toàn ở thiết bị của bạn
                </div>
              </div>

              <div className="mb-5 flex flex-wrap border bg-white border-slate-200 rounded-xl overflow-hidden p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setSheetsConfig({ ...sheetsConfig, connectionMethod: "script" })}
                  className={`flex-1 min-w-[200px] py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    sheetsConfig.connectionMethod === "script" || !sheetsConfig.connectionMethod
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  🚀 Google Apps Script Web App (Tối ưu - Không hết hạn)
                </button>
                <button
                  type="button"
                  onClick={() => setSheetsConfig({ ...sheetsConfig, connectionMethod: "token" })}
                  className={`flex-1 min-w-[200px] py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    sheetsConfig.connectionMethod === "token"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  🔑 Nhập Access Token tạm thời (Cần cập nhật mỗi 1 giờ)
                </button>
              </div>

              {(sheetsConfig.connectionMethod === "script" || !sheetsConfig.connectionMethod) ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Google Apps Script Web App URL */}
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      Đường dẫn Web App URL
                      <span 
                        onClick={() => { setHelpTab("script"); setShowHelpModal(true); }} 
                        className="text-[10px] text-emerald-600 font-semibold cursor-pointer underline flex items-center gap-0.5"
                      >
                        Cách tạo?
                      </span>
                    </label>
                    <input 
                      type="text" 
                      placeholder="https://script.google.com/macros/s/.../exec"
                      value={sheetsConfig.scriptUrl || ""}
                      onChange={(e) => setSheetsConfig({ ...sheetsConfig, scriptUrl: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Link Web App dạng <span className="font-mono bg-slate-100 px-1 rounded">/exec</span> sau khi Triển khai Apps Script.
                    </p>
                  </div>

                  {/* Spreadsheet ID Input (Optional in Script, passed as parameter) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                      ID Bảng tính (Spreadsheet ID)
                    </label>
                    <input 
                      type="text" 
                      placeholder="Nhập ID từ URL của file Excel..."
                      value={sheetsConfig.spreadsheetId}
                      onChange={(e) => setSheetsConfig({ ...sheetsConfig, spreadsheetId: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Chuỗi ký tự dài nằm giữa <span className="font-mono bg-slate-100 px-1 rounded">/d/</span> và <span className="font-mono bg-slate-100 px-1 rounded">/edit</span>.
                    </p>
                  </div>

                  {/* Sheet Page Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                      Tên Trang Tính (Sheet Page Name)
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ví dụ: Trang_Tinh_1, Sheet1..."
                      value={sheetsConfig.sheetName}
                      onChange={(e) => setSheetsConfig({ ...sheetsConfig, sheetName: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Tên của Sheet nhỏ ở đáy bảng tính (mặc định: Trang_Tinh_1).
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Spreadsheet ID Input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                      ID Bảng tính Google Sheets (Spreadsheet ID)
                    </label>
                    <input 
                      type="text" 
                      placeholder="Nhập ID từ URL của file Excel Google..."
                      value={sheetsConfig.spreadsheetId}
                      onChange={(e) => setSheetsConfig({ ...sheetsConfig, spreadsheetId: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Chuỗi ký tự dài nằm giữa <span className="font-mono bg-slate-100 px-1 rounded">/d/</span> và <span className="font-mono bg-slate-100 px-1 rounded">/edit</span> trên liên kết Excel.
                    </p>
                  </div>

                  {/* Sheet Page Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                      Tên Trang Tính (Sheet Page Name)
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ví dụ: Trang_Tinh_1, Sheet1..."
                      value={sheetsConfig.sheetName}
                      onChange={(e) => setSheetsConfig({ ...sheetsConfig, sheetName: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Tên của Sheet nhỏ ở cạnh đáy bảng tính. Vui lòng viết chính xác từng chữ cái.
                    </p>
                  </div>

                  {/* Google OAuth Access Token Input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      Google OAuth Access Token
                      <span 
                        onClick={() => { setHelpTab("token"); setShowHelpModal(true); }} 
                        className="text-[10px] text-emerald-600 font-semibold cursor-pointer underline flex items-center gap-0.5"
                      >
                        Cách lấy Token?
                      </span>
                    </label>
                    <input 
                      type="password" 
                      placeholder="Paste access token vào đây..."
                      value={sheetsConfig.accessToken}
                      onChange={(e) => setSheetsConfig({ ...sheetsConfig, accessToken: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tracking-widest text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Token xác thực API. Trực tiếp ủy quyền viết bảng mà không chia sẻ tài khoản chính.
                    </p>
                  </div>
                </div>
              )}

              {/* Status Indicator */}
              <div className="mt-5 border-t border-emerald-950/5 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-500">
                <span className="text-xs text-slate-600 block">
                  💡 <i>Chương trình tự động sinh dòng tiêu đề (Số CCCD, Họ và tên...) nếu trang tính của bạn trống.</i>
                </span>
                
                {((sheetsConfig.connectionMethod === "script" || !sheetsConfig.connectionMethod) ? sheetsConfig.scriptUrl : (sheetsConfig.spreadsheetId && sheetsConfig.accessToken)) ? (
                  <div className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-100/60 px-3 py-1 rounded-full font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Bảng tính đã sẵn sàng kết nối.
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-100/60 px-3 py-1 rounded-full font-semibold">
                    <AlertCircle className="w-3.5 h-3.5" /> Hãy điền thông tin tối thiểu ở trên để bắt đầu lưu dữ liệu!
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* LEFT COLUMN: Input Control / Camera scanning zone (60% width on Desktop) */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:p-6 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Camera className="w-5 h-5 text-emerald-500" /> Vùng nhận diện ảnh thẻ CCCD
                </h2>
                <div className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-semibold">
                  Tải ảnh hoặc Quét Camera
                </div>
              </div>

              <p className="text-slate-600 text-xs leading-relaxed mb-4">
                Hỗ trợ trích xuất từ <strong className="text-emerald-700 font-bold">Mặt trước</strong> (có QR chụp cận cảnh thì AI sẽ tự giải mã cả <strong className="text-emerald-700 font-bold">Ngày cấp</strong>) hoặc <strong className="text-emerald-700 font-bold">Mặt sau</strong> của thẻ CCCD. Các kết quả quét liên tiếp sẽ nhận dạng và Tự động gộp chung thông tin lại!
              </p>

              {/* Central Capture / Scanner Display Area */}
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="relative bg-slate-950 border-2 border-dashed border-slate-700 rounded-xl overflow-hidden min-h-[300px] md:min-h-[380px] flex flex-col items-center justify-center text-center p-4 transition-all hover:border-emerald-500 group"
              >
                {/* Animated scanner overlay laser line (active when captures or scanning state is on) */}
                {isScanning && (
                  <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
                    <div className="absolute top-0 inset-x-0 w-full bg-emerald-500-glow h-0.5 animate-scan" style={{
                      boxShadow: "0 0 12px 3px rgba(16, 185, 129, 0.75)"
                    }} />
                    <div className="absolute inset-0 bg-emerald-500/5 animate-pulse" />
                  </div>
                )}

                {/* Sub-modes display block */}
                {isCameraActive ? (
                  // Active hardware Camera Screen
                  <div className="absolute inset-0 w-full h-full flex flex-col justify-between">
                    <video 
                      ref={videoRef}
                      playsInline 
                      muted 
                      className="absolute inset-0 w-full h-full object-cover z-0"
                    />

                    {/* Camera Guidance Rect template frame overlay */}
                    <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                      <div className="w-[85%] h-[60%] sm:w-[75%] sm:h-[55%] border-2 border-dashed border-emerald-400 rounded-xl bg-slate-900/20 shadow-[0_0_0_2000px_rgba(15,23,42,0.6)]">
                        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-emerald-500 text-slate-950 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                          ĐỊNH KHUNG CCCD VÀO ĐÂY
                        </div>
                      </div>
                    </div>

                    {/* Active Camera Action Bar layout */}
                    <div className="absolute bottom-4 inset-x-0 z-20 flex justify-center items-center gap-4 px-4">
                      <button 
                        onClick={disableCamera}
                        className="px-4 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-900 text-white text-xs font-bold backdrop-blur-sm shadow border border-slate-700 transition"
                      >
                        Hủy
                      </button>
                      
                      <button 
                        onClick={capturePhoto}
                        className="w-14 h-14 rounded-full bg-white text-slate-950 flex items-center justify-center hover:scale-105 active:scale-95 shadow-xl transition-all border-4 border-emerald-500"
                        title="Chụp ảnh ngay"
                      >
                        <div className="w-10 h-10 rounded-full bg-slate-950 group-hover:bg-slate-900 flex items-center justify-center">
                          <Camera className="w-5 h-5 text-white" />
                        </div>
                      </button>
                    </div>
                  </div>
                ) : imageUri ? (
                  // Image Preview Screen
                  <div className="relative w-full h-full flex items-center justify-center z-10">
                    <img 
                      src={imageUri} 
                      alt="CCCD Captured Target Preview" 
                      className="max-h-[350px] object-contain rounded-lg border border-slate-800"
                    />
                    
                    {/* Clear/Retake badge */}
                    <button 
                      onClick={() => { setImageUri(null); }}
                      className="absolute top-2 right-2 bg-rose-500/90 text-white hover:bg-rose-600 p-2 rounded-lg transition shadow-lg"
                      title="Hủy ảnh này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  // Empty Upload guide Screen
                  <div className="z-10 flex flex-col items-center justify-center text-slate-300">
                    <div className="bg-slate-900 p-4 rounded-full mb-3 text-emerald-400 group-hover:scale-110 duration-300">
                      <UploadCloud className="w-10 h-10" />
                    </div>
                    <p className="text-sm font-bold text-white mb-1">Kéo và thả ảnh CCCD vào đây</p>
                    <p className="text-xs text-slate-400 mb-4 max-w-[250px]">Hoặc click nút bên dưới để chọn File từ thiết bị</p>
                    
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 tracking-wide shadow transition"
                    >
                      Chọn từ thư viện ảnh
                    </button>
                  </div>
                )}
              </div>

              {/* Camera Error Info prompt */}
              {cameraError && (
                <div className="mt-3 bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start gap-2.5 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{cameraError}</span>
                </div>
              )}

              {/* Photo Input action select strip */}
              <div className="flex items-center gap-3 mt-4">
                <button 
                  onClick={enableCamera}
                  disabled={isCameraActive}
                  className="flex-1 py-2.5 px-4 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  Mở Máy ảnh Quét trực tiếp
                </button>

                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition"
                >
                  <UploadCloud className="w-4 h-4 text-slate-500" />
                  Tải file ảnh thẻ lên
                </button>
              </div>

              {/* Secret HTML form inputs for camera & files */}
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Quick scanning state spinner */}
            {isScanning && (
              <div className="mt-6 bg-slate-900 text-white p-4 rounded-xl flex items-center gap-4">
                <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
                <div>
                  <div className="text-xs font-bold text-emerald-400 tracking-wide flex items-center gap-1">
                    AI ĐANG PHÂN TÍCH CCCD <span className="animate-bounce">...</span>
                  </div>
                  <p className="text-[10px] text-slate-300 mt-0.5">Gemini 3.5 đang phát hiện các trường thông tin trên ảnh dân cư quốc gia</p>
                </div>
              </div>
            )}

            {/* Scan Error Prompt */}
            {scanError && (
              <div className="mt-6 bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl flex flex-col gap-1.5 text-xs">
                <span className="font-bold flex items-center gap-1"><AlertCircle className="w-4 h-4" /> TRÍCH XUẤT THẤT BẠI</span>
                <p className="text-slate-600 line-clamp-3">{scanError}</p>
                <button 
                  onClick={() => imageUri && triggerOcr(imageUri)}
                  className="mt-2 text-[10px] bg-rose-100/60 hover:bg-rose-200 px-3 py-1 text-rose-800 font-semibold self-start rounded-md flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3 h-3" /> Thử OCR lại ảnh này
                </button>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: Extracted Form Fields & Submit Action Area (40% width on Desktop) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:p-6 flex flex-col justify-between">
            
            {/* Header info */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" /> Kết quả trích xuất CCCD
                </h2>
                {extractedInfo ? (
                  <button
                    onClick={() => {
                      setExtractedInfo(null);
                      setImageUri(null);
                    }}
                    className="text-[10px] text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-slate-200 px-2 py-1 rounded font-bold transition flex items-center gap-1"
                    title="Xóa toàn bộ thông tin đang trích xuất để quét mới"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Nhập mới
                  </button>
                ) : (
                  <div className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full font-bold">
                    Bản xem trước dữ liệu
                  </div>
                )}
              </div>

              {/* Status empty warning */}
              {!extractedInfo && !isScanning && (
                <div className="text-center py-12 px-4 border-2 border-dashed border-slate-100 rounded-2xl text-slate-500 flex flex-col items-center justify-center">
                  <div className="bg-slate-100 p-3 rounded-full text-slate-400 mb-3">
                    <Database className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">Chưa có thông tin nhận dạng</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
                    Hãy chụp ảnh CCCD hoặc tải ảnh từ máy khách để AI phân lập thông tin tự động hiển thị tại đây.
                  </p>
                </div>
              )}

              {/* Skeletion Loader mock when scanning */}
              {isScanning && (
                <div className="space-y-4 animate-pulse">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="space-y-1">
                      <div className="h-3 bg-slate-200 rounded w-1/4" />
                      <div className="h-9 bg-slate-100 rounded-lg w-full" />
                    </div>
                  ))}
                </div>
              )}

              {/* Live Form with Extracted data */}
              {extractedInfo && !isScanning && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-500 italic bg-amber-50 p-2 rounded-lg border border-amber-100 flex items-start gap-1.5 mb-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>Vui lòng kiểm tra kỹ lưỡng các thông tin bên dưới và sửa lại các ký tự bị sai trước khi nhấn nút Lưu vào Google Sheet.</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5">
                    {/* ID Card number (Số CCCD) */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <CreditCard className="w-3 h-3 text-slate-500" /> Số CCCD (12 số)
                      </label>
                      <input 
                        type="text" 
                        value={extractedInfo.idNumber || ""}
                        onChange={(e) => handleFieldChange("idNumber", e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                      />
                    </div>

                    {/* Name (Họ và tên) */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-500" /> Họ và Tên
                      </label>
                      <input 
                        type="text" 
                        value={extractedInfo.fullName || ""}
                        onChange={(e) => handleFieldChange("fullName", e.target.value.toUpperCase())}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* DOB (Ngày sinh) */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" /> Ngày sinh
                        </label>
                        <input 
                          type="text" 
                          value={extractedInfo.dob || ""}
                          onChange={(e) => handleFieldChange("dob", e.target.value)}
                          placeholder="DD/MM/YYYY"
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                        />
                      </div>

                      {/* Gender (Giới tính) */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-500" /> Giới tính
                        </label>
                        <select 
                          value={extractedInfo.gender || ""}
                          onChange={(e) => handleFieldChange("gender", e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                        >
                          <option value="Nam">Nam</option>
                          <option value="Nữ">Nữ</option>
                          <option value="Khác">Khác</option>
                        </select>
                      </div>
                    </div>

                    {/* Place of Origin (Quê quán) */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-500" /> Quê quán (Nguyên quán)
                      </label>
                      <textarea 
                        rows={2}
                        value={extractedInfo.placeOfOrigin || ""}
                        onChange={(e) => handleFieldChange("placeOfOrigin", e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white resize-none"
                      />
                    </div>

                    {/* Place of Residence (Nơi thường trú) */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-500" /> Nơi thường trú
                      </label>
                      <textarea 
                        rows={2}
                        value={extractedInfo.placeOfResidence || ""}
                        onChange={(e) => handleFieldChange("placeOfResidence", e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white resize-none"
                      />
                    </div>

                    {/* QR Code configuration fields (oldId & issueDate) */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      {/* Old ID */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <CreditCard className="w-3 h-3 text-slate-500" /> Số CMND/CCCD cũ (nếu có)
                        </label>
                        <input 
                          type="text" 
                          placeholder="CMND cũ 9 hoặc 12 số"
                          value={extractedInfo.oldId || ""}
                          onChange={(e) => handleFieldChange("oldId", e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                        />
                      </div>

                      {/* Issue Date */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" /> Ngày cấp CCCD (nếu có)
                        </label>
                        <input 
                          type="text" 
                          placeholder="DD/MM/YYYY"
                          value={extractedInfo.issueDate || ""}
                          onChange={(e) => handleFieldChange("issueDate", e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* Dynamic QR code section */}
                    <div className="border-t border-slate-100 mt-4 pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <QrCode className="w-4 h-4 text-emerald-500" /> Mã QR CCCD tự động
                        </h3>
                        <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full font-bold">
                          Đúng chuẩn Quốc Gia
                        </span>
                      </div>
                      
                      <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                        Tự động mã hóa thông tin sang chuỗi định dạng quét chuẩn (<code className="bg-slate-100 px-1 rounded font-mono text-[9px]">Số_CCCD|CMND|Họ_Tên|Ngày_Sinh|Giới_Tính|Địa_Chỉ|Ngày_Cấp</code>).
                      </p>

                      <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex flex-col sm:flex-row items-center gap-4">
                        <div className="relative group/qr shrink-0 bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex items-center justify-center">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(
                              `${extractedInfo.idNumber || ""}|${extractedInfo.oldId || ""}|${extractedInfo.fullName || ""}|${(extractedInfo.dob || "").replace(/\//g, "")}|${extractedInfo.gender || ""}|${extractedInfo.placeOfResidence || ""}|${(extractedInfo.issueDate || "").replace(/\//g, "")}`
                            )}`}
                            alt="Mã QR CCCD"
                            referrerPolicy="no-referrer"
                            className="w-24 h-24 object-contain"
                          />
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/qr:opacity-100 flex items-center justify-center rounded-lg transition duration-200">
                            <span className="text-[9px] text-white bg-slate-950/80 px-1.5 py-0.5 rounded font-medium">Auto QR</span>
                          </div>
                        </div>

                        <div className="flex-1 w-full space-y-2 text-xs">
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Dữ liệu mã quét</span>
                            <div className="relative flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden pr-8 pl-2 py-1 text-[9px] font-mono break-all text-slate-600 select-all min-h-[40px] max-h-[64px] overflow-y-auto">
                              {`${extractedInfo.idNumber || ""}|${extractedInfo.oldId || ""}|${extractedInfo.fullName || ""}|${(extractedInfo.dob || "").replace(/\//g, "")}|${extractedInfo.gender || ""}|${extractedInfo.placeOfResidence || ""}|${(extractedInfo.issueDate || "").replace(/\//g, "")}`}
                              
                              <button
                                onClick={() => copyQrString(
                                  `${extractedInfo.idNumber || ""}|${extractedInfo.oldId || ""}|${extractedInfo.fullName || ""}|${(extractedInfo.dob || "").replace(/\//g, "")}|${extractedInfo.gender || ""}|${extractedInfo.placeOfResidence || ""}|${(extractedInfo.issueDate || "").replace(/\//g, "")}`
                                )}
                                title="Copy Mã QR"
                                className="absolute right-1 top-1.5 p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-50 rounded transition"
                              >
                                {copiedQr ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 pt-0.5">
                            <button
                              onClick={() => downloadQrCode(
                                `${extractedInfo.idNumber || ""}|${extractedInfo.oldId || ""}|${extractedInfo.fullName || ""}|${(extractedInfo.dob || "").replace(/\//g, "")}|${extractedInfo.gender || ""}|${extractedInfo.placeOfResidence || ""}|${(extractedInfo.issueDate || "").replace(/\//g, "")}`,
                                extractedInfo.fullName || "cccd"
                              )}
                              disabled={downloadingQr}
                              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 text-[10px] font-bold rounded-md transition"
                            >
                              <Download className="w-3 h-3 shrink-0" />
                              {downloadingQr ? "Đang tải..." : "Tải ảnh QR PNG"}
                            </button>
                            
                            <button
                              onClick={() => copyQrString(
                                `${extractedInfo.idNumber || ""}|${extractedInfo.oldId || ""}|${extractedInfo.fullName || ""}|${(extractedInfo.dob || "").replace(/\//g, "")}|${extractedInfo.gender || ""}|${extractedInfo.placeOfResidence || ""}|${(extractedInfo.issueDate || "").replace(/\//g, "")}`
                              )}
                              className="px-2 py-1 border border-slate-200 text-slate-600 hover:bg-slate-100 text-[10px] font-bold rounded-md transition flex items-center gap-0.5"
                            >
                              {copiedQr ? "Đã copy!" : "Copy chuỗi QR"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Google Sheets save action status and button */}
            {extractedInfo && !isScanning && (
              <div className="mt-8 pt-5 border-t border-slate-200 space-y-3.5">
                {/* Save status alert */}
                {sheetsStatus.type !== "idle" && (
                  <div className={`p-4 rounded-xl flex items-start gap-2.5 text-xs ${
                    sheetsStatus.type === "loading" ? "bg-slate-50 border border-slate-200 text-slate-700" :
                    sheetsStatus.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-800 animate-pulse" :
                    "bg-rose-50 border border-rose-200 text-rose-800"
                  }`}>
                    {sheetsStatus.type === "loading" && <RefreshCw className="w-4 h-4 text-slate-500 animate-spin shrink-0 mt-0.5" />}
                    {sheetsStatus.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                    {sheetsStatus.type === "error" && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
                    <span>{sheetsStatus.message}</span>
                  </div>
                )}

                {/* Confirm Add Google Sheet button */}
                <button 
                  onClick={handleSaveToSheets}
                  disabled={sheetsStatus.type === "loading"}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm rounded-xl tracking-wide flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Đẩy lên Google Sheets
                </button>
              </div>
            )}
          </div>
        </section>

        {/* LOG HISTORY LOGGING GRID ELEMENT: Persistent full history log tracking */}
        <section className="lg:col-span-12">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-slate-500" />
                <h3 className="font-bold text-slate-900 text-base">Lịch Sử Quét & Lưu bảng</h3>
                {scanHistory.length > 0 && (
                  <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                    {scanHistory.length}
                  </span>
                )}
              </div>

              {scanHistory.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 self-start sm:self-center transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xoá lịch sử lưu
                </button>
              )}
            </div>

            {scanHistory.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs italic">
                Chưa có dữ liệu nào được đẩy lên Google Sheet trong phiên làm việc này.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-900 font-bold bg-slate-50">
                      <th className="py-2.5 px-3 text-center">STT</th>
                      <th className="py-2.5 px-3">Thời Gian</th>
                      <th className="py-2.5 px-3">Số CCCD</th>
                      <th className="py-2.5 px-3">Họ và Tên</th>
                      <th className="py-2.5 px-3">Ngày sinh</th>
                      <th className="py-2.5 px-3">Giới tính</th>
                      <th className="py-2.5 px-3">Địa Chỉ Thường Trú</th>
                      <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scanHistory.map((log, index) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 text-center font-bold text-slate-500">{scanHistory.length - index}</td>
                        <td className="py-3 px-3 font-medium text-slate-700">{log.timestamp}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">{log.info.idNumber}</td>
                        <td className="py-3 px-3 font-semibold text-slate-900 uppercase">{log.info.fullName}</td>
                        <td className="py-3 px-3">{log.info.dob}</td>
                        <td className="py-3 px-3">{log.info.gender}</td>
                        <td className="py-3 px-3 max-w-[200px] truncate" title={log.info.placeOfResidence}>
                          {log.info.placeOfResidence}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 animate-pulse" /> Đã lưu Sheet
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* HELP INSTRUCTION GUIDE MODAL LAYOUT */}
      <AnimatePresence>
        {showHelpModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative"
            >
              <h3 className="text-lg font-extrabold text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-500" /> Hướng dẫn kết nối Google Sheets
              </h3>

              {/* Tabs for choosing method inside modal */}
              <div className="flex border-b border-slate-100 mb-4 text-xs font-bold gap-2">
                <button 
                  type="button"
                  onClick={() => setHelpTab("script")}
                  className={`pb-2.5 px-1 relative cursor-pointer ${helpTab === "script" ? "text-emerald-600 border-b-2 border-emerald-500" : "text-slate-400 hover:text-slate-600"}`}
                >
                  Cách 1: Google Apps Script (Khuyên dùng - Ổn định vĩnh viễn)
                </button>
                <button 
                  type="button"
                  onClick={() => setHelpTab("token")}
                  className={`pb-2.5 px-1 relative cursor-pointer ${helpTab === "token" ? "text-emerald-600 border-b-2 border-emerald-500" : "text-slate-400 hover:text-slate-600"}`}
                >
                  Cách 2: Ghi qua Access Token (Hết hạn sau 1 tiếng)
                </button>
              </div>
              
              <div className="space-y-4 text-xs text-slate-600 leading-relaxed max-h-[420px] overflow-y-auto pr-2">
                {helpTab === "script" ? (
                  <div className="space-y-4">
                    <p className="text-slate-500 font-medium">
                      Đây là giải pháp <b>tối ưu nhất</b>. Bạn không cần lấy token nhiều lần hay sợ bị hết hạn. Ứng dụng quét sẽ gọi qua Web App tự sinh của bạn để gửi dữ liệu trực tiếp lên file Sheets bất kỳ lúc nào!
                    </p>

                    <div>
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mb-1.5">
                        <span className="w-5 h-5 bg-emerald-100 text-emerald-800 flex items-center justify-center rounded-full text-xs font-bold">1</span>
                        Thiết lập đoạn mã (Code) Apps Script
                      </h4>
                      <div className="pl-6.5 space-y-2">
                        <p>Mở file Google Sheet chỉnh sửa của bạn, chọn menu <b>Tiện ích mở rộng (Extensions)</b> &rarr; <b>Apps Script</b>.</p>
                        <p>Dán đoạn code được chuẩn bị sẵn bên dưới đè hoàn toàn lên file gốc:</p>
                        
                        <div className="relative bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[10px] text-emerald-400 max-h-[160px] overflow-y-auto">
                          <pre>{GOOGLE_APPS_SCRIPT_CODE}</pre>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
                              setCopiedScript(true);
                              setTimeout(() => setCopiedScript(false), 2000);
                            }}
                            className="absolute top-2 right-2 px-2 py-1 bg-slate-850 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[9px] font-bold shadow transition cursor-pointer"
                          >
                            {copiedScript ? "Đã copy!" : "Sao chép mã"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mb-1">
                        <span className="w-5 h-5 bg-emerald-100 text-emerald-800 flex items-center justify-center rounded-full text-xs font-bold">2</span>
                        Triển khai (Deploy) Web App của bạn
                      </h4>
                      <ol className="list-decimal list-inside pl-6.5 space-y-1">
                        <li>Ở màn hình Apps Script, bấm vào nút <b>Triển khai (Deploy)</b> nằm phía trên cùng bên phải &rarr; chọn <b>Triển khai mới (New deployment)</b>.</li>
                        <li>Ở bánh răng cấu hình, chọn loại <b>Ứng dụng web (Web app)</b>.</li>
                        <li>Điền phần mô tả tuỳ ý (ví dụ: <code className="bg-slate-100 px-1 rounded font-mono text-emerald-700">sheets-gateway</code>).</li>
                        <li>Mục <b>Triển khai dưới dạng (Execute as)</b>: Chọn <b className="text-slate-800">Tài khoản của tôi (Me)</b>.</li>
                        <li>Mục <b>Ai có quyền truy cập (Who has access)</b>: Bắt buộc chọn <b className="text-rose-600">Bất kỳ ai (Anyone)</b>. Điều này cho phép ứng dụng gửi dữ liệu quét vào danh sách của bạn từ xa rất an toàn.</li>
                        <li>Nhấn nút <b>Triển khai (Deploy)</b>. Hệ thống sẽ bật popup yêu cầu chọn tài khoản và cho phép cấp quyền đọc ghi Google Drive bảng tính, hãy chọn Tài khoản và cho phép để hoàn tất.</li>
                      </ol>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mb-1">
                        <span className="w-5 h-5 bg-emerald-100 text-emerald-800 flex items-center justify-center rounded-full text-xs font-bold">3</span>
                        Sao chép và Dán đường dẫn Web App của bạn
                      </h4>
                      <p className="pl-6.5">
                        Sau khi hoàn tất uỷ quyền, copy chuỗi địa chỉ <b>URL ứng dụng web</b> (thường có đuôi kết thúc là <span className="font-mono bg-slate-100 px-1 rounded break-all">/exec</span>) và dán thông tin này vào ô <b>Đường dẫn Web App URL</b> bên cấu hình ứng dụng là hoàn thành kết nối vĩnh viễn!
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mb-1">
                        <span className="w-5 h-5 bg-emerald-100 text-emerald-800 flex items-center justify-center rounded-full text-xs font-bold">1</span>
                        Cách lấy ID Bảng Tính (Spreadsheet ID)
                      </h4>
                      <p className="pl-6.5 text-slate-600">
                        Mở bảng tính Google Sheets của bạn. Hãy nhìn vào đường dẫn URL trên trình duyệt web, tìm chuỗi ký tự dài nằm giữa <span className="font-mono bg-slate-100 px-1 rounded">/spreadsheets/d/</span> và <span className="font-mono bg-slate-100 px-1 rounded">/edit</span>.
                        <br />
                        <i>Ví dụ:</i> Đường dẫn của bảng là <span className="font-mono bg-slate-100 break-all px-1.5 rounded">https://docs.google.com/spreadsheets/d/<b className="text-emerald-600">1ABCxyz_ID789</b>/edit#gid=0</span>.
                        ID của bạn chính là: <b className="text-emerald-600 font-mono text-sm">1ABCxyz_ID789</b>
                      </p>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mb-1">
                        <span className="w-5 h-5 bg-emerald-100 text-emerald-800 flex items-center justify-center rounded-full text-xs font-bold">2</span>
                        Cách tạo nhanh Google OAuth Access Token
                      </h4>
                      <p className="pl-6.5 font-medium">
                        Để nhanh nhất, bạn hãy sử dụng công cụ thử nghiệm được Google phát triển:
                      </p>
                      <ol className="list-decimal list-inside pl-8 mt-1 space-y-1">
                        <li>Mở trang web chính thức: <a href="https://developers.google.com/oauthplayground/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 font-semibold underline inline-flex items-center gap-0.5">Google OAuth Playground <ExternalLink className="w-3 h-3 inline" /></a></li>
                        <li>Ở thanh bên trái <b>Step 1</b>, dán hoặc tìm quyền: <span className="font-mono bg-slate-100 px-1 py-0.5 text-emerald-700">https://www.googleapis.com/auth/spreadsheets</span></li>
                        <li>Ấn nút <b>Authorize APIs</b> màu xanh, đăng nhập vào tài khoản Google của bạn và nhấn <b>Allow</b> (Cho phép).</li>
                        <li>Ở <b>Step 2</b>, bấm nút <b>Exchange authorization code for tokens</b>.</li>
                        <li>Kéo xuống và copy chuỗi kí tự nằm sau từ khóa <span className="font-bold font-mono">Access Token</span> (thường bắt đầu bằng <span className="font-mono">ya29...</span>).</li>
                        <li>Paste token này vào mục cấu hình trên ứng dụng của chúng tôi!</li>
                      </ol>
                      <p className="pl-6.5 mt-2 italic text-slate-500">
                        ⚠️ Lưu ý quan trọng: Google OAuth Playground Access Token chỉ tồn tại trong vòng 3600 giây (1 giờ). Vui lòng đổi Token mới nếu hệ thống trả về lỗi "Unauthorized" sau 1 tiếng. Do đó, phương thức sử dụng Apps Script là khuyên dùng nhất!
                      </p>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mb-1">
                        <span className="w-5 h-5 bg-emerald-100 text-emerald-800 flex items-center justify-center rounded-full text-xs font-bold">3</span>
                        Chia sẻ quyền ghi tệp (Nhớ kiểm tra!)
                      </h4>
                      <p className="pl-6.5">
                        Đảm bảo file Google Sheets của bạn đang ở chế độ chỉnh sửa. Nếu file có chứa lớp bảo mật nâng cao hoặc do công ty quản lý, hãy chắc chắn tài khoản Google tạo ra Access Token ở bước 2 có toàn quyền biên tập được tệp này.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setShowHelpModal(false)}
                  className="px-5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white hover:bg-slate-800 text-xs font-bold transition cursor-pointer"
                >
                  Tôi đã hiểu, đóng lại
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DESKTOP APP EXE PACKAGING GUIDE MODAL */}
      <AnimatePresence>
        {showExeBuildModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative"
            >
              <h3 className="text-lg font-extrabold text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
                <Monitor className="w-5 h-5 text-indigo-500" /> Hướng dẫn đóng gói ứng dụng thành file App.exe
              </h3>
              
              <div className="space-y-4 text-xs text-slate-600 leading-relaxed max-h-[420px] overflow-y-auto pr-2">
                <p className="text-slate-500">
                  Chào bạn! Vì đây là môi trường đám mây Linux, chúng tôi không thể trực tiếp xuất ra tệp tin chạy <code className="bg-slate-100 px-1 rounded font-mono text-slate-700">.exe</code> trực tiếp cho Windows tại đây. Tuy nhiên, bạn có thể tự đóng gói ứng dụng này thành một file <b>App.exe</b> chạy mượt mà trên máy tính của mình chỉ trong <b>30 giây</b> bằng các công cụ mã nguồn mở tốt nhất thế giới hiện nay:
                </p>

                {/* Method 1: Pake */}
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-indigo-900 text-sm flex items-center gap-1.5">
                      <span className="w-5 h-5 bg-indigo-100 text-indigo-800 flex items-center justify-center rounded-full text-xs font-bold">1</span>
                      Cách 1: Dùng Pake (Khuyên dùng - Cực nhẹ ~5MB)
                    </h4>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">Khuyên Dùng</span>
                  </div>
                  <p className="text-slate-600">
                    Pake là công cụ tiên tiến viết bằng Rust giúp đóng gói bất kỳ website nào thành phần mềm máy tính Desktop (Windows/Mac/Linux) chạy độc lập, siêu nhanh và chiếm cực ít RAM.
                  </p>
                  <p className="font-bold text-slate-800 mt-2">Các bước đóng gói:</p>
                  <ol className="list-decimal list-inside pl-2 space-y-1">
                    <li>Đảm bảo máy tính của bạn đã cài <a href="https://nodejs.org/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Node.js</a>.</li>
                    <li>Mở chương trình <b>Terminal</b> hoặc <b>CMD (Command Prompt)</b> trên máy tính của bạn và dán dòng lệnh bên dưới:</li>
                  </ol>
                  
                  <div className="relative mt-2 bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between text-[10px] font-mono text-emerald-400 overflow-x-auto select-all">
                    <span>npx pake-cli https://{window.location.host || "ais-pre-45unlraxym2bh7rve5kyav-307982617850.asia-east1.run.app"} --name "QuetCCCD" --icon https://cdn-icons-png.flaticon.com/512/9356/9356230.png</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`npx pake-cli https://${window.location.host || "ais-pre-45unlraxym2bh7rve5kyav-307982617850.asia-east1.run.app"} --name "QuetCCCD" --icon https://cdn-icons-png.flaticon.com/512/9356/9356230.png`);
                        alert("Đã copy lệnh Pake!");
                      }}
                      className="ml-2 px-2 py-1 bg-slate-800 text-slate-300 hover:text-white rounded text-[9px] font-bold"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 italic">
                    💡 Sau khi chạy xong lệnh trên, Pake sẽ tự động nén và tạo sẵn một file cài đặt <span className="font-bold text-slate-700">QuetCCCD.msi</span> hoặc <span className="font-bold text-slate-700">QuetCCCD.exe</span> ở ngay thư mục hiện tại của máy tính để bạn cài đặt và sử dụng!
                  </p>
                </div>

                {/* Method 2: Offline Electron package */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <span className="w-5 h-5 bg-slate-100 text-slate-800 flex items-center justify-center rounded-full text-xs font-bold">2</span>
                    Cách 2: Build sang dự án Electron Offline
                  </h4>
                  <p className="text-slate-600">
                    Sử dụng Electron để chạy ứng dụng hoàn toàn ngoại tuyến ngay lập tức từ máy tính cá nhân.
                  </p>
                  <p className="font-bold text-slate-800">Cách thao tác:</p>
                  <ol className="list-decimal list-inside pl-2 space-y-1">
                    <li>Nhấp vào góc trên bên phải ứng dụng của bạn, chọn <b>Export ZIP</b> để tải toàn bộ mã nguồn này về máy tính cá nhân của bạn.</li>
                    <li>Giải nén thư mục dự án và mở bằng trình soạn thảo mã nguồn (như VS Code).</li>
                    <li>Chạy các dòng lệnh sau trong CMD của thư mục dự án:</li>
                  </ol>
                  <div className="relative mt-2 bg-slate-900 p-3 rounded-lg text-[10px] font-mono text-indigo-300 space-y-1">
                    <div className="flex justify-between items-center text-slate-500 pb-1 mb-1 border-b border-slate-800">
                      <span>Cài đặt trình Electron Builder</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText("npm install electron electron-builder -D");
                          alert("Đã copy!");
                        }}
                        className="text-[9px] text-indigo-400 font-bold hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <div>npm install electron electron-builder -D</div>
                  </div>
                  <p className="text-[10px] mt-1 text-slate-500">
                    Sau đó chỉ cần chạy lệnh <code className="bg-slate-100 px-1 rounded font-mono">npm run build</code> rồi chạy <code className="bg-slate-100 px-1 rounded font-mono">npx electron-builder</code> để tạo file EXE cài đặt hoàn chỉnh.
                  </p>
                </div>

                {/* Method 3: PWA desktop wrap */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <span className="w-5 h-5 bg-slate-100 text-slate-800 flex items-center justify-center rounded-full text-xs font-bold">3</span>
                    Cách 3: Cài đặt dạng ứng dụng PWA chạy ở Desktop
                  </h4>
                  <p className="text-slate-600">
                    Bạn không cần cài đặt thêm bất kỳ công cụ dòng lệnh nào. Trên trình duyệt Google Chrome hoặc Edge, nhìn vào phía bên phải thanh địa chỉ URL. Bạn sẽ thấy biểu tượng hình máy tính có mũi tên đi xuống (Cài đặt ứng dụng / Install app).
                  </p>
                  <p className="text-slate-600">
                    Nhấp vào đó và chọn <b>Cài đặt (Install)</b>. Ứng dụng sẽ xuất hiện như một phần mềm biểu tượng Shortcut ngoài màn hình máy tính của bạn và có màn hình khởi chạy độc lập không kèm khung trình duyệt!
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setShowExeBuildModal(false)}
                  className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 text-xs font-bold transition"
                >
                  Tôi đã hiểu, đóng lại
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
