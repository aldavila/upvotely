import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left side - Form */}
      <div className="flex w-full flex-col justify-center px-4 py-12 lg:w-1/2 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-lg font-bold text-primary-foreground">
                U
              </span>
            </div>
            <span className="text-xl font-bold">Upvotely</span>
          </Link>
          {children}
        </div>
      </div>

      {/* Right side - Branding */}
      <div className="hidden bg-primary lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:p-12">
        <div className="mx-auto max-w-md text-primary-foreground">
          <blockquote className="text-2xl font-medium leading-relaxed">
            "Finally, feedback management that doesn't punish us for growing.
            We switched from Canny and saved $400/month while getting more
            features."
          </blockquote>
          <div className="mt-8 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary-foreground/20" />
            <div>
              <div className="font-semibold">Sarah Chen</div>
              <div className="text-sm text-primary-foreground/80">
                Product Lead at TechStartup
              </div>
            </div>
          </div>
          <div className="mt-12 grid grid-cols-3 gap-8 border-t border-primary-foreground/20 pt-8">
            <div>
              <div className="text-3xl font-bold">1000+</div>
              <div className="text-sm text-primary-foreground/80">
                Happy teams
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold">50K+</div>
              <div className="text-sm text-primary-foreground/80">
                Feedback collected
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold">4.9★</div>
              <div className="text-sm text-primary-foreground/80">
                User rating
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
