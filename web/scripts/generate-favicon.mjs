import satori from "satori";
import sharp from "sharp";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fontData = readFileSync("/tmp/poppins-600.ttf");

const SIZE = 64;
const DOT_SIZE = Math.round(SIZE * 0.46 * 0.55);
const FONT_SIZE = Math.round(SIZE * 0.62);

async function generate(textColor, outFile) {
  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: SIZE,
          height: SIZE,
          background: "transparent",
          gap: 1,
        },
        children: [
          {
            type: "span",
            props: {
              style: {
                fontFamily: "Poppins",
                fontWeight: 600,
                fontSize: FONT_SIZE,
                color: textColor,
                lineHeight: 1,
                letterSpacing: "-1px",
              },
              children: "Rt",
            },
          },
          {
            type: "div",
            props: {
              style: {
                width: DOT_SIZE,
                height: DOT_SIZE,
                borderRadius: "50%",
                background: "#2A7A72",
                flexShrink: 0,
                marginBottom: 2,
              },
            },
          },
        ],
      },
    },
    {
      width: SIZE,
      height: SIZE,
      fonts: [
        {
          name: "Poppins",
          data: fontData,
          weight: 600,
          style: "normal",
        },
      ],
    }
  );

  await sharp(Buffer.from(svg)).png().toFile(resolve(__dirname, outFile));
  console.log(`favicon generated → ${outFile}`);
}

await generate("#1a1a1a", "../public/icon-light.png");
await generate("#ffffff", "../public/icon-dark.png");
