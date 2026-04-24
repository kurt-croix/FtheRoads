import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Button } from '@/components/ui/button';
import {
  Shield,
  MapPin,
  AlertTriangle,
  Eye,
  Mail,
  Key,
  ChevronRight,
} from 'lucide-react';

/** Key used to persist the user's "don't show again" preference in localStorage. */
const SPLASH_DISMISSED_KEY = 'ftheroads:splash_dismissed';

/**
 * Splash / landing page shown before the main app.
 *
 * Explains what FtheRoads is and assures visitors their
 * contact information is never stored or shared.
 */
export default function SplashPage() {
  const navigate = useNavigate();
  // Start as null so we can distinguish "haven't read localStorage yet" from "user dismissed"
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useSeoMeta({
    title: 'FtheRoads.com — Fix the Roads',
    description:
      'Community-powered road hazard reporting for Ray County, Missouri. Your contact information is never stored or shared.',
  });

  // Check localStorage on mount to see if the user previously dismissed the splash
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SPLASH_DISMISSED_KEY);
      if (stored === 'true') {
        // Skip straight to the app
        navigate('/map', { replace: true });
        return;
      }
    } catch {
      // localStorage may be unavailable (private browsing, etc.)
    }
    // Mark as loaded so the UI renders
    setDismissed(false);
  }, [navigate]);

  /** Persist the dismissal and navigate into the main app. */
  const handleEnter = (dontShowAgain: boolean) => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(SPLASH_DISMISSED_KEY, 'true');
      } catch {
        // Silently ignore storage errors
      }
    }
    setDismissed(true);
    navigate('/map', { replace: true });
  };

  // Still reading localStorage — render nothing to avoid flash
  if (dismissed === null) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Hero section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 mb-4">
            <img
              src="/logo.png"
              alt="FtheRoads logo"
              className="h-12 w-12 rounded-lg"
            />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">
            F<span className="text-red-400">the</span>Roads
            <span className="text-gray-400 text-lg font-normal">.com</span>
          </h1>
          <p className="mt-2 text-orange-400 font-semibold text-sm tracking-wide uppercase">
            "F" is for Fix
          </p>
        </div>

        {/* Main card */}
        <div className="bg-gray-800/80 backdrop-blur rounded-2xl border border-gray-700/50 shadow-2xl p-6 space-y-5">
          {/* What it is */}
          <section>
            <h2 className="text-white font-bold text-lg flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-orange-400" />
              What is this?
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              FtheRoads is a{' '}
              <strong className="text-white">community-powered</strong> road
              hazard reporting tool for{' '}
              <strong className="text-white">Ray County, Missouri</strong>.
              Report potholes, ditches, flooding, obstructions, and other road
              issues so they get fixed faster.
            </p>
          </section>

          {/* How it works */}
          <section>
            <h2 className="text-white font-bold text-lg flex items-center gap-2 mb-3">
              <MapPin className="h-5 w-5 text-blue-400" />
              How it works
            </h2>
            <ol className="text-gray-300 text-sm space-y-2 list-decimal list-inside">
              <li>
                <strong className="text-white">Drop a pin</strong> on the map
                where the hazard is
              </li>
              <li>
                <strong className="text-white">Describe</strong> the issue
                (type, severity, details)
              </li>
              <li>
                <strong className="text-white">Submit</strong> — the report is
                sent to the responsible road district
              </li>
            </ol>
          </section>

          {/* Nostr explanation */}
          <section>
            <h2 className="text-white font-bold text-lg flex items-center gap-2 mb-3">
              <Key className="h-5 w-5 text-purple-400" />
              About Nostr accounts
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-3">
              FtheRoads uses <strong className="text-white">Nostr</strong> — a
              decentralized identity protocol — instead of traditional usernames
              and passwords. When you create an account, you get a{' '}
              <strong className="text-white">private key</strong> (like a
              password) and a{' '}
              <strong className="text-white">public key</strong> (like a
              username).
            </p>
            <ul className="text-gray-300 text-sm space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5 shrink-0">1.</span>
                <span>
                  <strong className="text-white">New users</strong> — we
                  generate a key pair for you. Just save your private key
                  somewhere safe (it acts as your password).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5 shrink-0">2.</span>
                <span>
                  <strong className="text-white">Returning users</strong> —
                  paste your private key or use a Nostr browser extension to
                  sign back in.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5 shrink-0">3.</span>
                <span>
                  No email, no phone number, no server stores your credentials.
                  <strong className="text-white"> You own your identity.</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5 shrink-0">4.</span>
                <span>
                  <strong className="text-white">Save your private key!</strong>{' '}
                  Your report is sent as an encrypted email via{' '}
                  <a
                    href="https://app.nostrmail.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    Nmail
                  </a>
                  . Log in there with your private key to view sent reports and
                  any replies from road districts.
                </span>
              </li>
            </ul>
          </section>

          {/* Privacy assurance */}
          <section className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <h2 className="text-green-400 font-bold flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5" />
              Your privacy matters
            </h2>
            <ul className="text-gray-300 text-sm space-y-1.5">
              <li className="flex items-start gap-2">
                <Eye className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                <span>
                  <strong className="text-white">
                    Contact info is never stored or shared.
                  </strong>{' '}
                  If you provide an email or phone number, it's used only to send
                  a single notification to the relevant road district — then it's
                  gone.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                <span>
                  No accounts required. No tracking. No database of users.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                <span>
                  Reports are published via the{' '}
                  <strong className="text-white">Nostr</strong> protocol — a
                  decentralized network with no central authority collecting your
                  data.
                </span>
              </li>
            </ul>
          </section>

          {/* CTA buttons */}
          <div className="space-y-3 pt-2">
            <Button
              onClick={() => handleEnter(false)}
              className="w-full h-12 bg-red-500 hover:bg-red-600 text-white font-bold text-base rounded-xl transition-all"
            >
              Enter FtheRoads
              <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleEnter(true)}
              className="w-full text-gray-400 hover:text-gray-200 text-xs"
            >
              Don't show this again
            </Button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-500 mt-4">
          Ray County, Missouri{' '}
          <span className="mx-1">&bull;</span> Community-Powered Road Reporting
        </p>
      </div>
    </div>
  );
}
