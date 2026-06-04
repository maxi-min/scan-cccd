export interface CCCDInfo {
  idNumber: string;
  fullName: string;
  dob: string;
  gender: string;
  nationality: string;
  placeOfOrigin: string;
  placeOfResidence: string;
  expiryDate?: string;
  oldId?: string;
  issueDate?: string;
}

export interface SheetsConfig {
  spreadsheetId: string;
  sheetName: string;
  accessToken: string;
  connectionMethod?: "token" | "script";
  scriptUrl?: string;
}

export interface ScanLog {
  id: string;
  timestamp: string;
  info: CCCDInfo;
  status: "pending" | "success" | "failed";
  sheetRowIndex?: number;
}
