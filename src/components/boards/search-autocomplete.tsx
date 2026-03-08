'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ChevronUp } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';

interface AutocompleteResult {
  id: string;
  title: string;
  voteCount: number;
}

interface SearchAutocompleteProps {
  boardId: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSelect?: (postId: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchAutocomplete({
  boardId,
  value,
  onChange,
  onSubmit,
  onSelect,
  placeholder = 'Search feedback...',
  className,
}: SearchAutocompleteProps) {
  const [results, setResults] = useState<AutocompleteResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(value, 300);

  // Fetch results
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(
      `/api/posts/search?boardId=${boardId}&q=${encodeURIComponent(debouncedQuery)}&mode=autocomplete`
    )
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setResults(data.data || []);
          setIsOpen(true);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, boardId]);

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => Math.max(prev - 1, -1));
          break;
        case 'Enter':
          if (activeIndex >= 0 && results[activeIndex]) {
            e.preventDefault();
            onSelect?.(results[activeIndex].id);
            setIsOpen(false);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setActiveIndex(-1);
          break;
      }
    },
    [isOpen, activeIndex, results, onSelect]
  );

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <form onSubmit={onSubmit}>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          className="pl-9"
        />
      </form>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {isLoading ? (
            <div className="p-2 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : results.length === 0 ? (
            <div className="p-3 text-center text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            <ul className="max-h-60 overflow-auto py-1">
              {results.map((result, index) => (
                <li
                  key={result.id}
                  className={cn(
                    'flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-muted',
                    index === activeIndex && 'bg-muted'
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onSelect?.(result.id);
                    setIsOpen(false);
                  }}
                >
                  <span className="truncate">{result.title}</span>
                  <Badge variant="secondary" className="ml-2 shrink-0">
                    <ChevronUp className="mr-1 h-3 w-3" />
                    {result.voteCount}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
