import React, { useEffect, useState } from 'react';
import { Avatar, type AvatarProps } from '@mui/material';

interface SafeAvatarProps extends Omit<AvatarProps, 'src' | 'children'> {
    src?: string;
    fallback?: React.ReactNode;
    timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1500;

export const SafeAvatar: React.FC<SafeAvatarProps> = ({
    src,
    fallback = '?',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    sx,
    ...avatarProps
}) => {
    const [resolvedSrc, setResolvedSrc] = useState<string | undefined>();

    useEffect(() => {
        setResolvedSrc(undefined);

        if (!src) return;

        let isActive = true;
        const image = new Image();
        const timeoutId = window.setTimeout(() => {
            isActive = false;
            setResolvedSrc(undefined);
        }, timeoutMs);

        image.onload = () => {
            if (!isActive) return;
            window.clearTimeout(timeoutId);
            setResolvedSrc(src);
        };

        image.onerror = () => {
            if (!isActive) return;
            window.clearTimeout(timeoutId);
            setResolvedSrc(undefined);
        };

        image.src = src;

        return () => {
            isActive = false;
            window.clearTimeout(timeoutId);
            image.onload = null;
            image.onerror = null;
        };
    }, [src, timeoutMs]);

    return (
        <Avatar
            {...avatarProps}
            src={resolvedSrc}
            sx={[
                { bgcolor: '#e5e7eb', color: '#4b5563', fontWeight: 600 },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            {fallback}
        </Avatar>
    );
};
