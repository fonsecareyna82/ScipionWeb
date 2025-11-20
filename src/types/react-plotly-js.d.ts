// src/types/react-plotly-js.d.ts
declare module "react-plotly.js" {
  import * as React from "react";

  type PlotData = any;
  type PlotLayout = any;
  type PlotConfig = any;

  export interface PlotParams {
    data: PlotData[];
    layout?: PlotLayout;
    config?: PlotConfig;
    style?: React.CSSProperties;
    className?: string;
    useResizeHandler?: boolean;
    onClick?: (event: any) => void;
    onHover?: (event: any) => void;
    onUnhover?: (event: any) => void;
    onSelected?: (event: any) => void;
    onInitialized?: (figure: any) => void;
    onUpdate?: (figure: any) => void;
  }

  export default class Plot extends React.Component<PlotParams> {}
}
