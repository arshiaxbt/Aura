import { Ghost, UserX } from 'lucide-react';

interface GhostStateProps {
    address?: string;
    message?: string;
    compact?: boolean;
}

export function GhostState({
    address,
    message = 'No Ethos profile found',
    compact = false
}: GhostStateProps) {
    if (compact) {
        return (
            <div className="flex items-center gap-2 text-gray-500 py-2">
                <Ghost size={16} className="opacity-50" />
                <span className="text-xs font-mono">Unregistered</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="mb-4 animate-bounce-slow">
                <div className="relative">
                    <Ghost size={64} className="text-gray-600" strokeWidth={1} />
                    <div className="absolute inset-0 blur-xl bg-gray-500/20 rounded-full" />
                </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-400 mb-1">{message}</h3>
            <p className="text-xs text-gray-600 font-mono max-w-[200px] truncate">
                {address ? `${address.slice(0, 8)}...${address.slice(-6)}` : 'Unknown address'}
            </p>
        </div>
    );
}

interface ErrorStateProps {
    message?: string;
    onRetry?: () => void;
}

export function ErrorState({ message = 'Failed to load data', onRetry }: ErrorStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-6 px-4 text-center animate-in fade-in duration-200">
            <UserX size={48} className="text-[#F2B8B5] opacity-70 mb-3" />
            <p className="text-sm text-[#CAC4D0] mb-3 max-w-[280px]">{message}</p>
            {onRetry && (
                <button onClick={onRetry} className="text-xs text-[#D0BCFF] hover:underline">
                    Try again
                </button>
            )}
        </div>
    );
}

export function LoadingState() {
    return (
        <div className="flex flex-col items-center justify-center py-8 animate-pulse">
            <div className="w-16 h-16 rounded-full bg-gray-800 mb-4" />
            <div className="w-24 h-4 rounded bg-gray-800 mb-2" />
            <div className="w-32 h-3 rounded bg-gray-800" />
        </div>
    );
}
