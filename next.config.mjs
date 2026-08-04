/** @type {import('next').NextConfig} */

const convexImageHost = process.env.NEXT_PUBLIC_CONVEX_URL
    ? new URL(process.env.NEXT_PUBLIC_CONVEX_URL).hostname
    : undefined;

const nextConfig = {
    reactStrictMode: true,
    images: {
        remotePatterns: convexImageHost
            ? [{ protocol: 'https', hostname: convexImageHost }]
            : [],
    },
};

export default nextConfig;
