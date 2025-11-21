import { ShaderAnimation } from "@/components/ui/shader-animation";
import { motion } from 'framer-motion';

export function C2PAIntegrationDemo() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <div className="relative flex h-[400px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-green-300 bg-blue-700 shadow-lg">
        <ShaderAnimation/>
        <div className="absolute pointer-events-none z-10 text-center px-4">
          <span className="text-5xl md:text-6xl leading-none font-bold tracking-tight text-white drop-shadow-2xl">
            C2PA Signing Demo
          </span>
          <p className="mt-3 text-sm text-white/80 font-light">Live cryptographic content authentication</p>
        </div>
      </div>
    </motion.div>
  );
}
