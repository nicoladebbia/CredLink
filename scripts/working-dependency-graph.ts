#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';

interface DependencyNode {
    id: string;
    path: string;
    type: 'file' | 'package' | 'external';
    imports: string[];
    exports: string[];
}

interface DependencyGraph {
    nodes: DependencyNode[];
    edges: Array<{
        from: string;
        to: string;
        type: 'import' | 'require' | 'dynamic';
    }>;
    metadata: {
        generatedAt: string;
        totalFiles: number;
        totalDependencies: number;
        fingerprint: string;
    };
}

class WorkingDependencyGraph {
    private readonly projectRoot = '/Users/nicoladebbia/Code_Ideas/CredLink';
    
    async generateDependencyGraph(): Promise<DependencyGraph> {
        console.log('🔍 Generating working dependency graph for CredLink...');
        
        // 1. Find all TypeScript/JavaScript files
        const files = this.findAllSourceFiles();
        console.log(`📁 Found ${files.length} source files`);
        
        // 2. Analyze each file for dependencies
        const nodes: DependencyNode[] = [];
        const edges: DependencyGraph['edges'] = [];
        
        for (const filePath of files) {
            const node = await this.analyzeFile(filePath);
            nodes.push(node);
            
            // Create edges for imports
            for (const importPath of node.imports) {
                edges.push({
                    from: node.id,
                    to: importPath,
                    type: 'import'
                });
            }
        }
        
        // 3. Generate metadata
        const metadata = {
            generatedAt: new Date().toISOString(),
            totalFiles: files.length,
            totalDependencies: edges.length,
            fingerprint: this.generateFingerprint(nodes, edges)
        };
        
        const graph: DependencyGraph = {
            nodes,
            edges,
            metadata
        };
        
        // 4. Save results
        this.saveResults(graph);
        
        console.log('✅ Dependency graph generated successfully!');
        console.log(`📊 Summary: ${nodes.length} nodes, ${edges.length} edges`);
        
        return graph;
    }
    
    private findAllSourceFiles(): string[] {
        try {
            const output = execSync('find . -name "*.ts" -o -name "*.js" | grep -v node_modules | grep -v dist | grep -v .git', {
                cwd: this.projectRoot,
                encoding: 'utf8'
            });
            
            return output.trim().split('\n').filter(file => file.length > 0);
        } catch (error) {
            console.error('❌ Failed to find source files:', (error as Error).message);
            return [];
        }
    }
    
    private async analyzeFile(filePath: string): Promise<DependencyNode> {
        const fullPath = path.join(this.projectRoot, filePath);
        const relativePath = filePath;
        
        try {
            const content = readFileSync(fullPath, 'utf8');
            
            // Extract imports using regex
            const importRegex = /import.*from\s+['"`]([^'"`]+)['"`]/g;
            const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
            const dynamicImportRegex = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
            
            const imports: string[] = [];
            let match;
            
            // ES6 imports
            while ((match = importRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }
            
            // CommonJS requires
            while ((match = requireRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }
            
            // Dynamic imports
            while ((match = dynamicImportRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }
            
            // Extract exports (simplified)
            const exportRegex = /export\s+(?:default\s+)?(?:class|function|interface|const|let|var)\s+(\w+)/g;
            const exports: string[] = [];
            
            while ((match = exportRegex.exec(content)) !== null) {
                exports.push(match[1]);
            }
            
            return {
                id: relativePath,
                path: relativePath,
                type: 'file',
                imports: [...new Set(imports)], // Remove duplicates
                exports
            };
            
        } catch (error) {
            console.warn(`⚠️ Failed to analyze file ${filePath}:`, (error as Error).message);
            
            return {
                id: relativePath,
                path: relativePath,
                type: 'file',
                imports: [],
                exports: []
            };
        }
    }
    
    private generateFingerprint(nodes: DependencyNode[], edges: DependencyGraph['edges']): string {
        const data = JSON.stringify({ nodes, edges });
        return createHash('sha256').update(data).digest('hex').substring(0, 16);
    }
    
    private saveResults(graph: DependencyGraph): void {
        const outputPath = path.join(this.projectRoot, 'working-dependency-graph.json');
        writeFileSync(outputPath, JSON.stringify(graph, null, 2));
        console.log(`💾 Results saved to: ${outputPath}`);
    }
}

// CLI execution
async function main(): Promise<void> {
    const generator = new WorkingDependencyGraph();
    
    try {
        const graph = await generator.generateDependencyGraph();
        
        // Print summary statistics
        console.log('\n📈 DEPENDENCY GRAPH SUMMARY:');
        console.log(`Total Files: ${graph.metadata.totalFiles}`);
        console.log(`Total Dependencies: ${graph.metadata.totalDependencies}`);
        console.log(`Average Dependencies per File: ${(graph.metadata.totalDependencies / graph.metadata.totalFiles).toFixed(2)}`);
        console.log(`Fingerprint: ${graph.metadata.fingerprint}`);
        
        // Show top 10 files with most dependencies
        const sortedNodes = graph.nodes
            .sort((a, b) => b.imports.length - a.imports.length)
            .slice(0, 10);
        
        console.log('\n🔝 TOP 10 FILES BY DEPENDENCY COUNT:');
        for (const node of sortedNodes) {
            console.log(`  ${node.path}: ${node.imports.length} dependencies`);
        }
        
    } catch (error) {
        console.error('❌ Failed to generate dependency graph:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { WorkingDependencyGraph, DependencyGraph };
