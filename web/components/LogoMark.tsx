import { Poppins } from "next/font/google";

const poppins = Poppins({ weight: "600", subsets: ["latin"], display: "swap" });

interface LogoMarkProps {
  size?: number;
  dotColor?: string;
}

export default function LogoMark({ size = 16, dotColor = "#2A7A72" }: LogoMarkProps) {
  const dotSize = size * 0.46;
  const gap = size * 0.05;

  return (
    <span
      className={poppins.className}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      Rt
      <span
        style={{
          display: "inline-block",
          width: dotSize,
          height: dotSize,
          borderRadius: "50%",
          backgroundColor: dotColor,
          marginLeft: gap,
          flexShrink: 0,
        }}
      />
    </span>
  );
}
