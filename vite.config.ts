import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Versão do build: vai embutida no código (__APP_VERSION__) e num arquivo
// público (/version.json). O app aberto compara as duas de tempos em tempos e,
// se o servidor tiver uma mais nova, oferece "Atualizar" — no app instalado do
// iPhone a pessoa pode ficar dias com a versão antiga aberta.
const VERSAO_DO_BUILD = new Date().toISOString();

const arquivoDeVersao = () => ({
  name: 'arquivo-de-versao',
  generateBundle(this: any) {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ versao: VERSAO_DO_BUILD }),
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(VERSAO_DO_BUILD),
  },
  server: {
    host: "::",
    port: process.env.PORT ? Number(process.env.PORT) : 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), arquivoDeVersao()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: ['es2015', 'safari13'],
  },
}));
