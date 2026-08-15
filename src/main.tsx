// src/main.tsx
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import "./components/protocol/protocol-dark-overrides.css";
import "swiper/swiper-bundle.css";
import "flatpickr/dist/flatpickr.css";

import App from "./App";
import { AppWrapper } from "./components/common/PageMeta";
import { ThemeProvider } from "./context/ThemeContext";
import { ProcessingProvider } from "@/hooks/useProcessingPlugins";
import "./r3f-jsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ProcessingProvider>
      <ThemeProvider>
        <AppWrapper>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AppWrapper>
      </ThemeProvider>
    </ProcessingProvider>
  </QueryClientProvider>
);
