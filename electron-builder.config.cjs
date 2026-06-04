const fs = require("fs");
const path = require("path");

const pkg = require("./package.json");
const bundledEnv = path.join(__dirname, "build-env", "app.env");

const extraResources = [
  {
    from: "dist",
    to: "app/dist",
    filter: ["**/*"],
  },
  {
    from: ".env.example",
    to: "app/.env.example",
  },
];

if (fs.existsSync(bundledEnv)) {
  extraResources.push({
    from: bundledEnv,
    to: "app/.env",
  });
  console.log("[electron-builder] Đóng gói kèm build-env/app.env → resources/app/.env");
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...pkg.build,
  // CI tự detect và cố publish → cần GH_TOKEN; tắt để chỉ build file .exe
  publish: null,
  win: {
    ...pkg.build.win,
    signAndEditExecutable: false,
  },
  extraResources,
};
