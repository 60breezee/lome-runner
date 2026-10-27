import * as THREE from 'three';

function canvasTexture(width, height, draw, { repeatX = 1, repeatY = 1, crisp = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  if (crisp) texture.magFilter = THREE.NearestFilter;
  return texture;
}

function speckle(context, width, height, count, colors, maxSize) {
  for (let index = 0; index < count; index += 1) {
    context.fillStyle = colors[index % colors.length];
    const size = 1 + Math.random() * maxSize;
    context.fillRect(Math.random() * width, Math.random() * height, size, size);
  }
}

// The road tile covers the full road width and `tileLength` world units along it.
export function createRoadTexture({ roadWidth, laneWidth, tileLength, repeatY }) {
  return canvasTexture(
    256,
    1024,
    (context, width, height) => {
      const pxPerUnitX = width / roadWidth;
      const pxPerUnitY = height / tileLength;
      context.fillStyle = '#3b3a38';
      context.fillRect(0, 0, width, height);
      speckle(context, width, height, 2600, ['#45443f', '#34332f', '#4c4a45'], 2.5);

      context.fillStyle = 'rgba(30, 29, 27, 0.45)';
      context.fillRect(width * 0.12, height * 0.1, width * 0.22, height * 0.07);
      context.fillRect(width * 0.6, height * 0.62, width * 0.18, height * 0.1);

      context.fillStyle = '#2a2927';
      context.strokeStyle = '#5a5751';
      context.lineWidth = 3;
      context.beginPath();
      context.ellipse(width * 0.58, height * 0.3, 18, 18, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      context.strokeStyle = '#262523';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(width * 0.3, height * 0.8);
      context.lineTo(width * 0.34, height * 0.83);
      context.lineTo(width * 0.31, height * 0.86);
      context.lineTo(width * 0.37, height * 0.9);
      context.stroke();

      context.fillStyle = 'rgba(20, 19, 18, 0.35)';
      context.beginPath();
      context.ellipse(width * 0.45, height * 0.52, 16, 30, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = '#f1e3c6';
      const dashWidth = 0.12 * pxPerUnitX;
      const dashLength = 3 * pxPerUnitY;
      const dashPeriod = 6 * pxPerUnitY;
      [-0.5, 0.5].forEach((lane) => {
        const x = width / 2 + lane * laneWidth * pxPerUnitX - dashWidth / 2;
        for (let y = 0; y < height; y += dashPeriod) context.fillRect(x, y, dashWidth, dashLength);
      });
      const edge = (roadWidth / 2 - 0.18) * pxPerUnitX;
      context.fillRect(width / 2 - edge - 2, 0, 4, height);
      context.fillRect(width / 2 + edge - 2, 0, 4, height);
    },
    { repeatY },
  );
}

export function createCurbTexture(repeatY) {
  return canvasTexture(
    8,
    64,
    (context, width, height) => {
      context.fillStyle = '#b3261e';
      context.fillRect(0, 0, width, height / 2);
      context.fillStyle = '#f1e3c6';
      context.fillRect(0, height / 2, width, height / 2);
    },
    { repeatY, crisp: true },
  );
}

export function createSidewalkTexture(repeatY) {
  return canvasTexture(
    128,
    128,
    (context, width, height) => {
      context.fillStyle = '#cbbca2';
      context.fillRect(0, 0, width, height);
      speckle(context, width, height, 500, ['#c2b297', '#d4c6ad'], 2);
      context.fillStyle = '#9c8f78';
      context.fillRect(0, 0, width, 3);
      context.fillRect(width / 2, 0, 2, height);
    },
    { repeatY },
  );
}

export function createGroundTexture(repeatX, repeatY) {
  return canvasTexture(
    256,
    256,
    (context, width, height) => {
      context.fillStyle = '#b5532f';
      context.fillRect(0, 0, width, height);
      speckle(context, width, height, 1800, ['#a84a28', '#c2643d', '#9c4423', '#c97a52'], 3);
      context.fillStyle = 'rgba(120, 140, 70, 0.35)';
      for (let index = 0; index < 14; index += 1) {
        context.beginPath();
        context.ellipse(Math.random() * width, Math.random() * height, 6 + Math.random() * 8, 3, 0, 0, Math.PI * 2);
        context.fill();
      }
    },
    { repeatX, repeatY },
  );
}

export function createSkyTexture(horizonRatio, horizonColor) {
  const texture = canvasTexture(4, 256, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#4fa9d9');
    gradient.addColorStop(horizonRatio, horizonColor);
    gradient.addColorStop(1, horizonColor);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
