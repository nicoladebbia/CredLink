export function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200 mt-16">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900">CredLink</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4 max-w-md">
              Cryptographic image signing platform for content authenticity and provenance verification using C2PA standards.
            </p>
            <div className="flex items-center space-x-4">
              <a
                href="https://github.com/nicoladebbia/CredLink"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </a>
              <a
                href="#docs"
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-4">Product</h4>
            <ul className="space-y-2">
              <li>
                <a href="#features" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#api" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                  API Documentation
                </a>
              </li>
              <li>
                <a href="#pricing" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#roadmap" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                  Roadmap
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-4">Resources</h4>
            <ul className="space-y-2">
              <li>
                <a href="#docs" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="#examples" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                  Examples
                </a>
              </li>
              <li>
                <a href="#blog" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                  Blog
                </a>
              </li>
              <li>
                <a href="#support" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                  Support
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-slate-500">
              © 2025 CredLink. All rights reserved. Licensed under AGPLv3.
            </p>
            <div className="mt-4 md:mt-0 flex items-center space-x-6">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                Demo Mode
              </span>
              <a href="#privacy" className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
                Privacy Policy
              </a>
              <a href="#terms" className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
