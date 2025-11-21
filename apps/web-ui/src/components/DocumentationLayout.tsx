import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CodeBracketIcon, RocketLaunchIcon } from '@heroicons/react/24/outline';

interface DocumentationLayoutProps {
  title: string;
  description: string;
  task: string;
  codebaseSupport: string[];
  componentStructure: string;
  dependencies: string[];
  implementationGuidelines: string[];
  integrationSteps: string[];
  children: React.ReactNode;
}

export function DocumentationLayout({
  title,
  description,
  task,
  codebaseSupport,
  componentStructure,
  dependencies,
  implementationGuidelines,
  integrationSteps,
  children
}: DocumentationLayoutProps) {
  return (
    <main className="container mx-auto px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-5xl mx-auto"
        >
          {/* Title Section */}
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">{title}</h2>
            <p className="text-base text-slate-600 mb-4">{description}</p>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                <CodeBracketIcon className="h-3 w-3 mr-1" />
                Developer Ready
              </Badge>
              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                <RocketLaunchIcon className="h-3 w-3 mr-1" />
                Production Grade
              </Badge>
              <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                C2PA Compliant
              </Badge>
            </div>
          </div>

          {/* Task Section */}
          <Card className="mb-4 border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CodeBracketIcon className="h-5 w-5 text-blue-600" />
                Task Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 text-sm leading-relaxed">{task}</p>
            </CardContent>
          </Card>

          {/* Codebase Support Section */}
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Tech Stack</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {codebaseSupport.map((item, index) => (
                  <div key={index} className="flex items-center space-x-2 text-sm">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0" />
                    <span className="text-slate-700">{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Component Structure Section */}
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Component Structure</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-700 text-sm leading-relaxed">{componentStructure}</p>
              </div>
            </CardContent>
          </Card>

          {/* Dependencies Section */}
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Dependencies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-900 rounded-lg p-3 overflow-x-auto">
                <code className="text-green-400 text-xs">
                  {dependencies.join(' ')}
                </code>
              </div>
            </CardContent>
          </Card>

          {/* Implementation Guidelines */}
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Implementation Guidelines</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {implementationGuidelines.map((guideline, index) => (
                  <div key={index} className="border-l-2 border-blue-500 pl-3">
                    <p className="text-slate-700 text-sm leading-relaxed">{guideline}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Integration Steps */}
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Integration Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {integrationSteps.map((step, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                      {index + 1}
                    </div>
                    <p className="text-slate-700 text-sm leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Interactive Demo Section */}
          <Card className="mb-4 border-green-200 bg-green-50/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-green-900">Live Integration Demo</CardTitle>
              <CardDescription className="text-sm">
                Experience the C2PA signing integration in real-time
              </CardDescription>
            </CardHeader>
            <CardContent>
              {children}
            </CardContent>
          </Card>

          {/* Questions Section */}
          <details className="mb-4">
            <summary className="cursor-pointer bg-white border rounded-lg p-4 hover:bg-slate-50 transition-colors">
              <span className="font-semibold text-slate-900">Integration Checklist</span>
              <span className="text-sm text-slate-500 ml-2">(Click to expand)</span>
            </summary>
            <div className="mt-2 bg-white border rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">Data & Props</h4>
                  <ul className="text-slate-600 space-y-1 text-xs">
                    <li>• Component props and data flow</li>
                    <li>• State management approach</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">Assets & Behavior</h4>
                  <ul className="text-slate-600 space-y-1 text-xs">
                    <li>• Required images, icons, etc.</li>
                    <li>• Responsive design requirements</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">Integration</h4>
                  <ul className="text-slate-600 space-y-1 text-xs">
                    <li>• Component placement in app</li>
                    <li>• Authentication integration</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">Performance</h4>
                  <ul className="text-slate-600 space-y-1 text-xs">
                    <li>• Performance benchmarks</li>
                    <li>• Large file upload handling</li>
                  </ul>
                </div>
              </div>
            </div>
          </details>
        </motion.div>

        {/* Footer */}
        <motion.div 
          className="border-t pt-6 mt-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="text-center text-xs text-slate-400">
            <p>© 2024 CredLink • Powered by C2PA • ISO 21436-1 Compliant</p>
          </div>
        </motion.div>
      </main>
  );
}
