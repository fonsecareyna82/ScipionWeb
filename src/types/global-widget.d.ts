// src/types/global-widget.d.ts
// Single source of truth for the global widget registry on window.

export type WidgetGlobal = {
  // All properties optional; different entries can add what they implement.
  mount?: any;
  mountProjectsWidget?: any;
  mountProjectPageWidget?: any;
};

declare global {
  interface Window {
    MyProjectsWidget?: WidgetGlobal;
  }
}

export {};
