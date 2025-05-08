const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const { JSDOM } = require('jsdom');
const { SVGPathData } = require('svg-pathdata');

// Create a virtual DOM
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;

// Function to convert SVG to PNG
async function convertSvgToPng(svgPath, pngPath, width, height) {
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Create an image from the SVG
    const img = await loadImage(`data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`);

    // Draw the image on the canvas
    ctx.drawImage(img, 0, 0, width, height);

    // Save as PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(pngPath, buffer);
}

// Convert all assets
async function convertAllAssets() {
    const assets = [
        { svg: 'assets/player.svg', png: 'assets/player.png', width: 160, height: 40 },
        { svg: 'assets/platform.svg', png: 'assets/platform.png', width: 300, height: 40 },
        { svg: 'assets/platform-glow.svg', png: 'assets/platform-glow.png', width: 310, height: 50 },
        { svg: 'assets/lava.svg', png: 'assets/lava.png', width: 150, height: 50 },
        { svg: 'assets/background.svg', png: 'assets/background.png', width: 1280, height: 720 }
    ];

    for (const asset of assets) {
        await convertSvgToPng(asset.svg, asset.png, asset.width, asset.height);
        console.log(`Converted ${asset.svg} to ${asset.png}`);
    }
}

convertAllAssets().catch(console.error); 