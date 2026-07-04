/** Client-side resize/compress for groom photos (browser only). */

const JPEG = "image/jpeg";

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress image."))),
      JPEG,
      quality
    );
  });
}

async function encodeCanvas(canvas, { maxBytes, quality }) {
  let q = quality;
  let blob = await canvasToBlob(canvas, q);
  while (blob.size > maxBytes && q > 0.45) {
    q -= 0.08;
    blob = await canvasToBlob(canvas, q);
  }
  return blob;
}

/**
 * Resize image to fit maxDim, compress to JPEG under maxBytes.
 */
export async function resizeImage(file, { maxDim, maxBytes, quality = 0.82 }) {
  const img = await loadImageFromFile(file);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return encodeCanvas(canvas, { maxBytes, quality });
}

/** Full-size board photo (~1600px, ~300KB) + card thumbnail (~400px). */
export async function prepareGroomPhotoFiles(file) {
  const [fullBlob, thumbBlob] = await Promise.all([
    resizeImage(file, { maxDim: 1600, maxBytes: 300 * 1024, quality: 0.82 }),
    resizeImage(file, { maxDim: 400, maxBytes: 80 * 1024, quality: 0.75 }),
  ]);
  return {
    full: new File([fullBlob], "photo.jpg", { type: JPEG }),
    thumb: new File([thumbBlob], "thumb.jpg", { type: JPEG }),
  };
}
