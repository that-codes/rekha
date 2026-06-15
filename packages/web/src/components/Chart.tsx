import { useEffect, useRef } from "react";
import uPlot from "uplot";

interface ChartProps {
  title: string;
  data: uPlot.AlignedData;
  series: { label: string; stroke: string }[];
  height?: number;
  format?: (v: number) => string;
}

/** Lightweight uPlot wrapper that resizes to its container and updates in place. */
export function Chart({ title, data, series, height = 200, format }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const opts: uPlot.Options = {
      title,
      width: ref.current.clientWidth,
      height,
      series: [
        {},
        ...series.map((s) => ({
          label: s.label,
          stroke: s.stroke,
          width: 1.5,
          value: (_u: uPlot, v: number) => (v == null ? "—" : format ? format(v) : v.toFixed(2)),
        })),
      ],
      axes: [
        { stroke: "#64748b", grid: { stroke: "#1e293b" } },
        { stroke: "#64748b", grid: { stroke: "#1e293b" } },
      ],
    };
    plot.current = new uPlot(opts, data, ref.current);

    const onResize = () => plot.current?.setSize({ width: ref.current!.clientWidth, height });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      plot.current?.destroy();
      plot.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    plot.current?.setData(data);
  }, [data]);

  return <div ref={ref} className="w-full" />;
}
