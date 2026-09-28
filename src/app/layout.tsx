import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { YahooLeagueProvider } from "@/lib/yahoo-league-context";
import { YahooConnectStatus } from "@/components/yahoo-connect-status";
import "./globals.css";

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fantasy Hockey Tools",
  description: "Draft assistant and tools for fantasy hockey managers.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${bigShoulders.variable} ${plexSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ice font-sans text-ink">
        <YahooLeagueProvider>
          <header className="border-b border-line bg-surface">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
              <Link
                href="/"
                className="font-display text-lg font-extrabold uppercase tracking-wide text-ink"
              >
                Fantasy Hockey Tools
              </Link>
              <nav className="flex gap-5 text-sm font-medium text-ink-dim">
                <Link href="/draft" className="hover:text-rink-blue">
                  Draft Assistant
                </Link>
                <Link href="/players" className="hover:text-rink-blue">
                  Players
                </Link>
                <Link href="/goalies" className="hover:text-rink-blue">
                  Goalies
                </Link>
              </nav>
              {session?.user && <YahooConnectStatus />}
              <div className="ml-auto flex items-center gap-3 text-sm">
                {session?.user ? (
                  <>
                    <span className="text-ink-dim">{session.user.name ?? session.user.email}</span>
                    <form
                      action={async () => {
                        "use server";
                        await signOut();
                      }}
                    >
                      <button
                        type="submit"
                        className="font-medium text-ink-faint hover:text-rink-blue"
                      >
                        Sign out
                      </button>
                    </form>
                  </>
                ) : (
                  <form
                    action={async () => {
                      "use server";
                      await signIn("google");
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded border border-rink-blue px-3 py-1.5 font-semibold text-rink-blue hover:bg-rink-blue hover:text-white"
                    >
                      Sign in
                    </button>
                  </form>
                )}
              </div>
            </div>
            <div className="h-[3px] bg-gradient-to-r from-rink-blue via-rink-blue to-transparent" />
          </header>
          <div className="flex-1">{children}</div>
        </YahooLeagueProvider>
      </body>
    </html>
  );
}
