import '@testing-library/jest-dom/vitest';

// jsdom ไม่มี matchMedia ให้ (react-hot-toast เรียกใช้เพื่อเช็ค prefers-reduced-motion)
if (!window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    });
}
