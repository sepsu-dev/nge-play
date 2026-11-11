export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0D0F14] text-[#18181B] dark:text-[#F4F5F7]">
      {children}
    </div>
  );
}
