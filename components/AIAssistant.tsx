import React, { useState } from 'react';
import { Sparkles, BrainCircuit, X, Loader2 } from 'lucide-react';
import { analyzeWorkNotes } from '../services/geminiService';
import { LineItem } from '../types';

interface AIAssistantProps {
  onAddItems: (items: Partial<LineItem>[]) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ onAddItems, isOpen, onClose }) => {
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    if (!input.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const items = await analyzeWorkNotes(input);
      onAddItems(items);
      onClose();
      setInput('');
    } catch (err) {
      setError('Failed to analyze notes. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5" />
            <h3 className="font-semibold text-lg">AI Invoice Assistant</h3>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-gray-600 mb-4 text-sm">
            Paste your rough job notes, timesheet dumps, or project descriptions below. 
            <span className="font-semibold text-indigo-600"> Gemini 3 Pro (Thinking Mode)</span> will analyze the complexity and break it down into professional invoice line items automatically.
          </p>
          
          <textarea
            className="w-full h-40 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm mb-4 resize-none"
            placeholder="e.g. Spent Monday fixing the deck framing (4 hours) and Tuesday installing the new balustrades (6 hours). Also bought materials..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !input.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Lines
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};