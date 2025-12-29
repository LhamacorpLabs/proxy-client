#!/bin/bash

# Script to create PNG icons from SVG source
# Requires: ImageMagick or Inkscape for SVG to PNG conversion

SVG_FILE="icons/icon.svg"
ICON_DIR="icons"

echo "Creating PNG icons from SVG..."

# Check if ImageMagick is available
if command -v magick &> /dev/null; then
    echo "Using ImageMagick to convert icons..."

    magick "$SVG_FILE" -resize 16x16 "$ICON_DIR/icon-16.png"
    magick "$SVG_FILE" -resize 32x32 "$ICON_DIR/icon-32.png"
    magick "$SVG_FILE" -resize 48x48 "$ICON_DIR/icon-48.png"
    magick "$SVG_FILE" -resize 128x128 "$ICON_DIR/icon-128.png"

    echo "Icons created successfully!"

elif command -v convert &> /dev/null; then
    echo "Using ImageMagick (convert) to convert icons..."

    convert "$SVG_FILE" -resize 16x16 "$ICON_DIR/icon-16.png"
    convert "$SVG_FILE" -resize 32x32 "$ICON_DIR/icon-32.png"
    convert "$SVG_FILE" -resize 48x48 "$ICON_DIR/icon-48.png"
    convert "$SVG_FILE" -resize 128x128 "$ICON_DIR/icon-128.png"

    echo "Icons created successfully!"

elif command -v inkscape &> /dev/null; then
    echo "Using Inkscape to convert icons..."

    inkscape "$SVG_FILE" --export-png="$ICON_DIR/icon-16.png" --export-width=16 --export-height=16
    inkscape "$SVG_FILE" --export-png="$ICON_DIR/icon-32.png" --export-width=32 --export-height=32
    inkscape "$SVG_FILE" --export-png="$ICON_DIR/icon-48.png" --export-width=48 --export-height=48
    inkscape "$SVG_FILE" --export-png="$ICON_DIR/icon-128.png" --export-width=128 --export-height=128

    echo "Icons created successfully!"

else
    echo "Error: No suitable image conversion tool found."
    echo "Please install one of the following:"
    echo "  - ImageMagick (brew install imagemagick)"
    echo "  - Inkscape (brew install inkscape)"
    echo ""
    echo "Alternatively, you can manually convert icons/icon.svg to PNG files:"
    echo "  - icons/icon-16.png (16x16)"
    echo "  - icons/icon-32.png (32x32)"
    echo "  - icons/icon-48.png (48x48)"
    echo "  - icons/icon-128.png (128x128)"

    exit 1
fi

echo "All icon files created in $ICON_DIR/"
ls -la "$ICON_DIR"/*.png