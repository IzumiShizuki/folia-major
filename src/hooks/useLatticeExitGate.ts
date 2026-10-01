import { useCallback, useEffect, useState } from 'react';
import { useAppViewStore } from '../stores/useAppViewStore';
import type { AppView } from '../stores/useAppViewStore';

export const useLatticeExitGate = (currentView: AppView) => {
    const [hasLatticeExited, setHasLatticeExited] = useState(currentView !== 'lattice');

    useEffect(() => {
        if (currentView === 'lattice') setHasLatticeExited(false);
    }, [currentView]);

    const onLatticeExitComplete = useCallback(() => {
        setHasLatticeExited(useAppViewStore.getState().view !== 'lattice');
    }, []);

    return { hasLatticeExited, onLatticeExitComplete };
};
