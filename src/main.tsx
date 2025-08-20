import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "swiper/swiper-bundle.css";
import "flatpickr/dist/flatpickr.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import { ProcessingProvider} from "@/hooks/useProcessingPlugins.tsx";

createRoot(document.getElementById("root")!).render(
  //<StrictMode>
  <ProcessingProvider>
    <ThemeProvider>
      <AppWrapper>
        <App />
      </AppWrapper>
    </ThemeProvider>
    </ProcessingProvider>
 // </StrictMode>,
);
