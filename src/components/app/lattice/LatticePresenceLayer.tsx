import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

type LatticePresenceLayerProps = {
    active: boolean;
    duration: number;
    onExitComplete: () => void;
    children: ReactNode;
};

export default function LatticePresenceLayer({ active, duration, onExitComplete, children }: LatticePresenceLayerProps) {
    return (
        <AnimatePresence initial={false} onExitComplete={onExitComplete}>
            {active && (
                <motion.div
                    key="lattice"
                    className="absolute inset-0 z-10 pointer-events-auto"
                    initial={false}
                    animate={{ opacity: 1, pointerEvents: 'auto' }}
                    exit={{ opacity: 0, pointerEvents: 'none' }}
                    transition={{ duration, ease: 'easeIn' }}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
