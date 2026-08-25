import Image from "next/image";
// trimmed (transparent padding removed) from
// ~/code/dash/dash-platform/dash.web.mui/public/dash-logo.png
import logo from "./dash-logo.png";

export function DashLogo({ className }: { className?: string }) {
  return (
    <Image
      src={logo}
      alt="Dash Marketing"
      className={className}
      // rendered at most ~20px tall; skip full-width responsive variants
      sizes="200px"
    />
  );
}
