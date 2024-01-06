const { Canvas, createCanvas, Image, ImageData, loadImage } = require("canvas");
const { JSDOM } = require("jsdom");
const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs");

function loadOpenCV() {
  return new Promise((resolve) => {
    Module = {
      onRuntimeInitialized() {
        resolve();
      },
    };
    cv = require("../lib/opencv.js");
  });
}

function installDOM() {
  const dom = new JSDOM();
  global.document = dom.window.document;
  // The rest enables DOM image and canvas and is provided by node-canvas
  global.Image = Image;
  global.HTMLCanvasElement = Canvas;
  global.ImageData = ImageData;
  global.HTMLImageElement = Image;
}

(async function () {
  installDOM();
  await loadOpenCV();

  const roles = JSON.parse(await fs.readFileSync("roles.json", "utf8"));
  for (i in roles) {
    const role = roles[i];
    await processImage(role.data.title, role.data.img);
  }
})();

async function writeMatToFile(fileName, src, image) {
  const canvas = createCanvas(image.width, image.height);
  cv.imshow(canvas, src);
  await fs.writeFileSync(fileName, canvas.toBuffer("image/jpeg"));
}

async function processImage(name, url) {
  const imageResponse = await axios.get(url, { responseType: "arraybuffer" });

  const buffer = await sharp(imageResponse.data).png().toBuffer();
  const image = await loadImage(buffer);
  let src = cv.imread(image);

  await writeMatToFile(name + "-origin.png", src, image);

  let gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

  let blur = new cv.Mat();
  let ksize = new cv.Size(5, 5);
  cv.GaussianBlur(gray, blur, ksize, 0, 0, cv.BORDER_DEFAULT);

  let thresh = new cv.Mat();
  cv.threshold(blur, thresh, 120, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

  // Find contours
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    thresh,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  // Assume the largest contour is the object to keep
  let cnt = contours.get(0);
  let maxArea = cv.contourArea(cnt);
  let cntNumber = 0;
  for (let i = 1; i < contours.size(); ++i) {
    let tmp = contours.get(i);
    let area = cv.contourArea(tmp);
    if (area > maxArea) {
      cnt = tmp;
      maxArea = area;
      cntNumber = i;
    }
  }

  let mask = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);

  for (let i = 1; i < contours.size(); ++i) {
    let tmp = contours.get(i);
    let area = cv.contourArea(tmp);
    if (i === cntNumber || area * 20 > maxArea) {
      // Create mask from largest contour
      cv.drawContours(mask, contours, i, new cv.Scalar(255, 255, 255, 255), -1);
    }
  }

  // Bitwise-and mask with original image
  let dst = new cv.Mat();
  src.copyTo(dst, mask);

  // Save the result
  await writeMatToFile(name + "-crop.jpg", dst, image);

  // Cleanup
  src.delete();
  gray.delete();
  thresh.delete();
  contours.delete();
  hierarchy.delete();
  mask.delete();
  dst.delete();
}
