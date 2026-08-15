// postcss.config.js
import tailwindcss from "@tailwindcss/postcss";

const isWidgetBuild = process.env.WIDGET_BUILD === "1";
const widgetRootSelector = ".projectpage-widget-root";

function scopeWidgetCss() {
  return {
    postcssPlugin: "scopeWidgetCss",
    Rule(rule) {
      if (!rule.selector) return;

      const inputFile = rule.source?.input?.file ?? "";
      const isCssModule = inputFile.endsWith(".module.css");

      // doNotScopeCssModules
      if (isCssModule) return;

      const parent = rule.parent;
      const parentIsKeyframes =
        parent?.type === "atrule" && /keyframes$/i.test(parent.name);
      if (parentIsKeyframes) return;

      const selectors = rule.selectors ?? rule.selector.split(",");

      const scopedSelectors = selectors.map((rawSelector) => {
        const selector = rawSelector.trim();
        if (!selector) return selector;

        // avoidDoubleScoping
        if (selector.includes(widgetRootSelector)) return selector;

        // rewriteGlobalRoots
        if (
          selector === ":root" ||
          selector === ":host" ||
          selector === "html" ||
          selector === "body"
        ) {
          return widgetRootSelector;
        }

        // rewriteNestedRootHost
        if (selector.startsWith(":root")) {
          return selector.replace(/^:root\b/, widgetRootSelector);
        }
        if (selector.startsWith(":host")) {
          return selector.replace(/^:host\b/, widgetRootSelector);
        }
        if (selector.startsWith("html")) {
          return selector.replace(/^html\b/, widgetRootSelector);
        }
        if (selector.startsWith("body")) {
          return selector.replace(/^body\b/, widgetRootSelector);
        }

        // scopeUniversalSelectors
        if (selector === "*") return `${widgetRootSelector} *`;
        if (selector.startsWith("*")) return `${widgetRootSelector} ${selector}`;

        return `${widgetRootSelector} ${selector}`;
      });

      rule.selector = scopedSelectors.join(", ");
    },
  };
}
scopeWidgetCss.postcss = true;

export default {
  plugins: [tailwindcss(), ...(isWidgetBuild ? [scopeWidgetCss()] : [])],
};
