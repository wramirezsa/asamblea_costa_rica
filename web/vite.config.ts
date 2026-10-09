import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  optimizeDeps: {
    /**
     * Three.js y sus acompanantes se cargan de forma diferida (solo al entrar
     * al Salon 3D). Sin esta lista, Vite recien los descubre en ese momento,
     * vuelve a pre-empaquetar dependencias a mitad de sesion y la pagina que
     * ya estaba abierta se queda con referencias viejas: el lienzo 3D aparece
     * en blanco y NO se registra ningun error en consola.
     *
     * Declararlos aqui obliga a pre-empaquetarlos al arrancar el servidor, que
     * es cuando no molesta. Si se agrega otra dependencia pesada de carga
     * diferida, sumarla a esta lista.
     */
    include: ['three', '@react-three/fiber', '@react-three/drei', 'three-stdlib'],
  },
})
