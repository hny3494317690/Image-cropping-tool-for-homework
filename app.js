const fileInput = document.getElementById("fileInput");
const sourceImage = document.getElementById("sourceImage");
const outputImage = document.getElementById("outputImage");
const downloadBtn = document.getElementById("downloadBtn");
const cropBtn = document.getElementById("cropBtn");
const resetBtn = document.getElementById("resetBtn");
const fileInfo = document.getElementById("fileInfo");
const outputInfo = document.getElementById("outputInfo");
const dropZone = document.getElementById("dropZone");
const floatingActions = document.getElementById("floatingActions");
const floatingCropBtn = document.getElementById("floatingCropBtn");
const floatingDownloadBtn = document.getElementById("floatingDownloadBtn");

const MAX_SIZE = 300 * 1024;
const FLOATING_OFFSET = 12;

const themeToggle = document.getElementById("themeToggle");
const THEME_KEY = "theme";
const cropButtons = [cropBtn, floatingCropBtn].filter(Boolean);
const downloadLinks = [downloadBtn, floatingDownloadBtn].filter(Boolean);

const isMobileBrowser = () => {
  const ua = navigator.userAgent || "";
  const byUa = /Mobi|Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
  const byTouch = navigator.maxTouchPoints > 1 && window.innerWidth < 900;
  return byUa || byTouch;
};

const applyMobileClass = () => {
  document.body.classList.toggle("is-mobile", isMobileBrowser());
};

applyMobileClass();
window.addEventListener("resize", applyMobileClass);
window.addEventListener("orientationchange", applyMobileClass);

const getPreferredTheme = () => {
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
};

const applyTheme = (theme) => {
  document.body.classList.toggle("dark", theme === "dark");
  if (themeToggle) {
    themeToggle.checked = theme === "dark";
  }
};

const initTheme = () => {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved || getPreferredTheme());
};

initTheme();

if (themeToggle) {
  themeToggle.addEventListener("change", () => {
    const next = themeToggle.checked ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}

const themeMedia = window.matchMedia?.("(prefers-color-scheme: dark)");
if (themeMedia?.addEventListener) {
  themeMedia.addEventListener("change", (event) => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(event.matches ? "dark" : "light");
    }
  });
}

let cropper = null;
let sourceUrl = null;
let outputUrl = null;
let originalName = "image";
let floatingActionsFrame = null;
let isExporting = false;

const revokeUrl = (url) => {
  if (url) {
    URL.revokeObjectURL(url);
  }
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const setInfo = (text) => {
  outputInfo.textContent = text;
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const setDownloadState = (url, filename) => {
  downloadLinks.forEach((link) => {
    if (!link) return;

    if (url) {
      link.href = url;
      link.download = filename;
      link.classList.remove("disabled");
      link.setAttribute("aria-disabled", "false");
      link.tabIndex = 0;
      return;
    }

    link.classList.add("disabled");
    link.removeAttribute("href");
    link.removeAttribute("download");
    link.setAttribute("aria-disabled", "true");
    link.tabIndex = -1;
  });
};

const setCropButtonsDisabled = (disabled) => {
  cropButtons.forEach((button) => {
    if (!button) return;
    button.disabled = disabled;
  });
};

const setFloatingActionsVisible = (visible) => {
  if (!floatingActions) return;

  floatingActions.classList.toggle("visible", visible);
  floatingActions.setAttribute("aria-hidden", visible ? "false" : "true");

  if (!visible) {
    floatingActions.style.transform = `translate(${FLOATING_OFFSET}px, ${FLOATING_OFFSET}px)`;
  }
};

const cancelFloatingActionsUpdate = () => {
  if (!floatingActionsFrame) return;
  cancelAnimationFrame(floatingActionsFrame);
  floatingActionsFrame = null;
};

const updateFloatingActionsPosition = () => {
  floatingActionsFrame = null;

  if (!floatingActions || !dropZone || !cropper?.ready) {
    setFloatingActionsVisible(false);
    return;
  }

  const container = cropper.cropper || dropZone.querySelector(".cropper-container");
  const cropBoxData = cropper.getCropBoxData?.();

  if (
    !container ||
    !cropBoxData ||
    !Number.isFinite(cropBoxData.width) ||
    !Number.isFinite(cropBoxData.height) ||
    cropBoxData.width <= 0 ||
    cropBoxData.height <= 0
  ) {
    setFloatingActionsVisible(false);
    return;
  }

  const dropRect = dropZone.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  if (!dropRect.width || !dropRect.height || !containerRect.width || !containerRect.height) {
    setFloatingActionsVisible(false);
    return;
  }

  setFloatingActionsVisible(true);

  const controlsWidth = floatingActions.offsetWidth;
  const controlsHeight = floatingActions.offsetHeight;
  const containerLeft = containerRect.left - dropRect.left;
  const containerTop = containerRect.top - dropRect.top;
  const anchorX = containerLeft + cropBoxData.left + cropBoxData.width;
  const anchorY = containerTop + cropBoxData.top + cropBoxData.height;
  const maxLeft = dropZone.clientWidth - controlsWidth - FLOATING_OFFSET;
  const maxTop = dropZone.clientHeight - controlsHeight - FLOATING_OFFSET;
  let left = anchorX + FLOATING_OFFSET;
  let top = anchorY + FLOATING_OFFSET;

  if (left > maxLeft) {
    left = anchorX - controlsWidth - FLOATING_OFFSET;
  }
  if (top > maxTop) {
    top = anchorY - controlsHeight - FLOATING_OFFSET;
  }

  left = clamp(left, FLOATING_OFFSET, Math.max(FLOATING_OFFSET, maxLeft));
  top = clamp(top, FLOATING_OFFSET, Math.max(FLOATING_OFFSET, maxTop));

  floatingActions.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
};

const scheduleFloatingActionsUpdate = () => {
  if (!floatingActions || floatingActionsFrame) return;

  floatingActionsFrame = requestAnimationFrame(() => {
    updateFloatingActionsPosition();
  });
};

const resetOutput = (message = "导出尺寸与大小将在此显示") => {
  revokeUrl(outputUrl);
  outputUrl = null;
  outputImage.removeAttribute("src");
  setDownloadState(null);
  setInfo(message);
};

const destroyCropper = () => {
  cancelFloatingActionsUpdate();
  setFloatingActionsVisible(false);
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
};

const loadImageToCropper = (url) => {
  sourceImage.onload = () => {
    destroyCropper();
    setDropZoneState(true);
    cropper = new Cropper(sourceImage, {
      viewMode: 1,
      autoCropArea: 0.8,
      background: false,
      responsive: true,
      movable: true,
      zoomable: true,
      rotatable: true,
      ready() {
        scheduleFloatingActionsUpdate();
      },
      cropmove() {
        scheduleFloatingActionsUpdate();
      },
      crop() {
        if (outputUrl && !isExporting) {
          resetOutput("裁剪区域已变化，请重新裁切。");
        }
        scheduleFloatingActionsUpdate();
      },
      zoom() {
        scheduleFloatingActionsUpdate();
      },
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

const toJpegBlob = (canvas, quality = 0.92) =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
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

const setDropZoneState = (hasImage) => {
  if (!dropZone) return;
  dropZone.classList.toggle("has-image", hasImage);
};

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
      const blob = await toJpegBlob(canvas, 0.95);
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
    const blob = await toJpegBlob(canvas, 0.95);
    if (blob) return blob;
  } catch (_) {}

  return null;
};

let libheifModulePromise = null;

const getLibheifModule = async () => {
  const factory = globalThis.libheif;
  if (typeof factory !== "function") {
    throw new Error("ERR_HEIC_LIB_MISSING");
  }
  if (!libheifModulePromise) {
    const result = factory();
    libheifModulePromise = result?.then ? result : Promise.resolve(result);
  }
  return libheifModulePromise;
};

const decodeHeicWithLibheif = async (file) => {
  const libheif = await getLibheifModule();
  if (!libheif?.HeifDecoder) {
    throw new Error("ERR_HEIC_LIB_MISSING");
  }

  const buffer = await file.arrayBuffer();
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(buffer);

  if (!images || images.length === 0) {
    throw new Error("ERR_LIBHEIF format not supported");
  }

  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);

  await new Promise((resolve, reject) => {
    image.display(imageData, (displayData) => {
      if (!displayData) {
        reject(new Error("ERR_LIBHEIF decode failed"));
        return;
      }
      resolve();
    });
  });

  ctx.putImageData(imageData, 0, 0);

  if (typeof image.free === "function") {
    image.free();
  }
  if (typeof decoder.free === "function") {
    decoder.free();
  }

  return toJpegBlob(canvas, 0.95);
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
  if (message.includes("ERR_HEIC_LIB_MISSING")) {
    return "HEIC 解码库未加载，请检查 libheif 依赖文件。";
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

const exportJpegUnderLimit = async (canvas) => {
  let quality = 0.92;
  let scale = 1;
  let workingCanvas = canvas;
  let blob = await toJpegBlob(workingCanvas, quality);

  while (blob.size > MAX_SIZE && scale > 0.05) {
    if (quality > 0.6) {
      quality -= 0.07;
    } else {
      scale *= 0.9;
      workingCanvas = scaleCanvas(canvas, scale);
    }
    blob = await toJpegBlob(workingCanvas, quality);
  }

  return blob;
};

const runCropExport = async () => {
  if (!cropper || isExporting) return;

  isExporting = true;
  setCropButtonsDisabled(true);
  resetOutput("正在导出，请稍候...");

  try {
    const croppedCanvas = cropper.getCroppedCanvas();
    if (!croppedCanvas) {
      setInfo("裁切失败，请调整裁切框后重试。");
      return;
    }

    const blob = await exportJpegUnderLimit(croppedCanvas);
    if (!blob) {
      setInfo("导出失败，请重试。");
      return;
    }

    if (blob.size > MAX_SIZE) {
      setInfo("无法压缩到 300KB 以下，请缩小裁切区域后重试。");
      return;
    }

    outputUrl = URL.createObjectURL(blob);
    outputImage.src = outputUrl;
    setDownloadState(outputUrl, `${originalName}_cropped.jpg`);
    setInfo(`导出大小：${formatSize(blob.size)}（JPG）`);
  } finally {
    isExporting = false;
    setCropButtonsDisabled(false);
    scheduleFloatingActionsUpdate();
  }
};

const handleFile = async (file) => {
  if (!file) return;

  resetOutput();
  destroyCropper();
  revokeUrl(sourceUrl);
  setDropZoneState(false);

  originalName = file.name.replace(/\.[^/.]+$/, "") || "image";

  fileInfo.textContent = `原始文件：${file.name}（${formatSize(
    file.size
  )}）`;

  let blob = file;
  if (isHeic(file)) {
    try {
      const libheifBlob = await decodeHeicWithLibheif(file);
      if (libheifBlob) {
        blob = libheifBlob;
      } else {
        const nativeBlob = await decodeHeicWithBrowser(file);
        if (nativeBlob) {
          blob = nativeBlob;
        } else {
          throw new Error("ERR_HEIC_LIB_MISSING");
        }
      }
    } catch (error) {
      fileInfo.textContent = explainHeicError(error);
      return;
    }
  }

  sourceUrl = URL.createObjectURL(blob);
  loadImageToCropper(sourceUrl);
};

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  await handleFile(file);
});

if (dropZone) {
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      fileInput.value = "";
      await handleFile(file);
    }
  });
}

cropButtons.forEach((button) => {
  button.addEventListener("click", runCropExport);
});

resetBtn.addEventListener("click", () => {
  fileInput.value = "";
  fileInfo.textContent = "未选择图片";
  resetOutput();
  destroyCropper();
  revokeUrl(sourceUrl);
  sourceImage.removeAttribute("src");
  setDropZoneState(false);
});

window.addEventListener("resize", scheduleFloatingActionsUpdate);
window.addEventListener("orientationchange", scheduleFloatingActionsUpdate);

window.addEventListener("beforeunload", () => {
  cancelFloatingActionsUpdate();
  revokeUrl(sourceUrl);
  revokeUrl(outputUrl);
});
