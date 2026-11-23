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


// The user's text size (Settings → User): every absolute font size of the CSS, and the absolute line heights
// that go with them, are multiplied by --sw-font-scale (1 when it is not set, as in the embedded widget).
// Relative sizes (em, %, keywords) already follow their parent; the root's font size is left alone so rem
// values are not scaled twice.
const FONT_SCALE = "var(--sw-font-scale, 1)";

function scaleFontSizes() {
  const isRelative = (value) => /%/.test(value) || /(^|[^a-z])[\d.]+em\b/i.test(value) || /^[a-z-]+$/i.test(value);
  const isRootRule = (decl) => {
    const selector = decl.parent?.selector ?? "";
    return selector.split(",").some((part) => /^\s*(html|:root)\s*$/i.test(part));
  };
  return {
    postcssPlugin: "scaleFontSizes",
    Declaration(decl) {
      const prop = decl.prop.toLowerCase();
      const value = decl.value.trim();
      if (value.includes("--sw-font-scale") || isRelative(value)) return;
      if (prop === "font-size") {
        if (isRootRule(decl) || !/(\d(px|rem)\b)|var\(/.test(value)) return;
      } else if (prop === "line-height" || prop === "--tw-leading") {
        if (!/(\d(px|rem)\b)|var\(--spacing/.test(value)) return;
      } else {
        return;
      }
      decl.value = `calc(${value} * ${FONT_SCALE})`;
    },
  };
}
scaleFontSizes.postcss = true;

export default {
  plugins: [tailwindcss(), scaleFontSizes(), ...(isWidgetBuild ? [scopeWidgetCss()] : [])],
};
