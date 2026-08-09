import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
    plugins: [solidPlugin()],
    server: {
        port: 3000,
        watch: {
            ignored: ["**/src-tauri/target/**"],
        },
    },
    build: {
        target: "esnext",
    },
});
