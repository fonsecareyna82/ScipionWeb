// src/main.tsx
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "swiper/swiper-bundle.css";
import "flatpickr/dist/flatpickr.css";
import App from "./App";
import { AppWrapper } from "./components/common/PageMeta";
import { ThemeProvider } from "./context/ThemeContext";
import { ProcessingProvider } from "@/hooks/useProcessingPlugins";

createRoot(document.getElementById("root")!).render(
  <ProcessingProvider>
    <ThemeProvider>
      <AppWrapper>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppWrapper>
    </ThemeProvider>
  </ProcessingProvider>
);
