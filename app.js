const fileInput = document.getElementById("fileInput");
const sourceImage = document.getElementById("sourceImage");
const outputImage = document.getElementById("outputImage");
const downloadBtn = document.getElementById("downloadBtn");
const cropBtn = document.getElementById("cropBtn");
const resetBtn = document.getElementById("resetBtn");
const fileInfo = document.getElementById("fileInfo");
const outputInfo = document.getElementById("outputInfo");

const MAX_SIZE = 200 * 1024;

let cropper = null;
let sourceUrl = null;
let outputUrl = null;
let originalName = "image";

const revokeUrl = (url) => {
  if (url) {
    URL.revokeObjectURL(url);
  }
};

const setInfo = (text) => {
  outputInfo.textContent = text;
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const resetOutput = () => {
  revokeUrl(outputUrl);
  outputUrl = null;
  outputImage.removeAttribute("src");
  downloadBtn.classList.add("disabled");
  downloadBtn.removeAttribute("href");
  setInfo("导出尺寸与大小将在此显示");
};

const destroyCropper = () => {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
};

const loadImageToCropper = (url) => {
  sourceImage.onload = () => {
    destroyCropper();
    cropper = new Cropper(sourceImage, {
      viewMode: 1,
      autoCropArea: 0.8,
      background: false,
      responsive: true,
      movable: true,
      zoomable: true,
      rotatable: true,
    });
  };
  sourceImage.src = url;
};

const isHeic = (file) => {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
};

const normalizeHeicResult = (result) => {
  const value = Array.isArray(result) ? result[0] : result;
  if (!value) return null;
  if (value instanceof Blob) return value;
  if (value instanceof ArrayBuffer) {
    return new Blob([value], { type: "image/jpeg" });
  }
  if (ArrayBuffer.isView(value)) {
    return new Blob([value.buffer], { type: "image/jpeg" });
  }
  return null;
};

const toBlob = (canvas) =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });

const toJpegBlob = (canvas) =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.95);
  });

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取文件"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

const loadImageFromUrl = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = url;
  });

const decodeHeicWithBrowser = async (file) => {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await toJpegBlob(canvas);
      if (blob) return blob;
    } catch (_) {}
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadImageFromUrl(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const blob = await toJpegBlob(canvas);
    if (blob) return blob;
  } catch (_) {}

  return null;
};

const explainHeicError = (error) => {
  const message =
    typeof error === "string"
      ? error
      : error?.message || error?.toString?.() || "未知错误";

  if (message.includes("ERR_LIBHEIF format not supported")) {
    return "HEIC 编码格式不被当前浏览器/库支持。建议用 Safari 打开，或先用系统相册/图片工具导出为 JPG/PNG。";
  }
  if (message.includes("ERR_USER Image is already browser readable")) {
    return "浏览器已可直接读取该图片，请尝试重新选择或换个浏览器。";
  }
  if (message.includes("ERR_CANVAS")) {
    return "Canvas 转换失败，可能是浏览器安全限制或内存不足。";
  }
  if (message.includes("ERR_DOM")) {
    return "读取文件失败，请重新选择 HEIC 文件。";
  }
  if (message.includes("ERR_LIBHEIF")) {
    return "HEIC 解码失败，可能是该文件损坏或格式不兼容。";
  }

  return `HEIC 转换失败：${message}`;
};

const scaleCanvas = (canvas, scale) => {
  const scaledCanvas = document.createElement("canvas");
  scaledCanvas.width = Math.max(1, Math.floor(canvas.width * scale));
  scaledCanvas.height = Math.max(1, Math.floor(canvas.height * scale));
  const ctx = scaledCanvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
  return scaledCanvas;
};

const exportPngUnderLimit = async (canvas) => {
  let scale = 1;
  let blob = await toBlob(canvas);
  while (blob.size > MAX_SIZE && scale > 0.05) {
    scale *= 0.9;
    const scaledCanvas = scaleCanvas(canvas, scale);
    blob = await toBlob(scaledCanvas);
  }
  return blob;
};

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  resetOutput();
  destroyCropper();
  revokeUrl(sourceUrl);

  originalName = file.name.replace(/\.[^/.]+$/, "") || "image";

  fileInfo.textContent = `原始文件：${file.name}（${formatSize(
    file.size
  )}）`;

  let blob = file;
  if (isHeic(file)) {
    try {
      const nativeBlob = await decodeHeicWithBrowser(file);
      if (nativeBlob) {
        blob = nativeBlob;
      } else {
        if (typeof heic2any !== "function") {
          fileInfo.textContent = "HEIC 转换库未加载，请检查依赖文件。";
          return;
        }
        const result = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.9,
        });
        const normalized = normalizeHeicResult(result);
        if (!normalized) {
          fileInfo.textContent = "HEIC 转换结果异常，请更换浏览器再试。";
          return;
        }
        blob = normalized;
      }
    } catch (error) {
      fileInfo.textContent = explainHeicError(error);
      return;
    }
  }

  sourceUrl = URL.createObjectURL(blob);
  loadImageToCropper(sourceUrl);
});

cropBtn.addEventListener("click", async () => {
  if (!cropper) return;
  resetOutput();

  const croppedCanvas = cropper.getCroppedCanvas();
  if (!croppedCanvas) return;

  const blob = await exportPngUnderLimit(croppedCanvas);
  if (!blob) return;

  if (blob.size > MAX_SIZE) {
    setInfo("无法压缩到 200KB 以下，请缩小裁切区域后重试。");
    return;
  }

  outputUrl = URL.createObjectURL(blob);
  outputImage.src = outputUrl;
  downloadBtn.href = outputUrl;
  downloadBtn.download = `${originalName}_cropped.png`;
  downloadBtn.classList.remove("disabled");
  setInfo(`导出大小：${formatSize(blob.size)}（PNG）`);
});

resetBtn.addEventListener("click", () => {
  fileInput.value = "";
  fileInfo.textContent = "未选择图片";
  resetOutput();
  destroyCropper();
  revokeUrl(sourceUrl);
  sourceImage.removeAttribute("src");
});

window.addEventListener("beforeunload", () => {
  revokeUrl(sourceUrl);
  revokeUrl(outputUrl);
});
