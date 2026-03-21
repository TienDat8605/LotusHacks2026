import { CheckCircle2, FileVideo, Loader2, Upload, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { getApiClient } from '@/api/getClient';
import type { UgcJobStatusResponse } from '@/api/types';
import { usePageMeta } from '@/hooks/usePageMeta';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export default function UgcUpload() {
  usePageMeta({
    title: 'VibeMap — Upload Location',
    description: 'Upload your own location video and extract transcript, OCR, and structured location evidence.',
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pointOfInterest, setPointOfInterest] = useState('');
  const [city, setCity] = useState('Ho Chi Minh City');
  const [address, setAddress] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [atmosphere, setAtmosphere] = useState('');
  const [confirmReady, setConfirmReady] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const [result, setResult] = useState<UgcJobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedPointOfInterest = pointOfInterest.trim();
  const trimmedCity = city.trim();
  const trimmedAddress = address.trim();
  const uploading = uploadPhase !== 'idle';
  const hasRequiredFields = !!selectedFile && !!trimmedPointOfInterest && !!trimmedCity;
  const canConfirm = hasRequiredFields && !uploading;
  const canUpload = hasRequiredFields && confirmReady && !uploading;

  async function uploadNow() {
    if (!selectedFile || !confirmReady || !hasRequiredFields) return;
    setUploadPhase('uploading');
    setResult(null);
    setError(null);
    try {
      const api = getApiClient();
      const queued = await api.uploadLocationVideo({
        file: selectedFile,
        pointOfInterest: trimmedPointOfInterest,
        city: trimmedCity,
        address: trimmedAddress,
      });
      setUploadPhase('processing');
      const processed = await api.processLocationVideo(queued.jobId);
      setResult(processed);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed';
      setError(message);
    } finally {
      setUploadPhase('idle');
    }
  }

  return (
    <div className="h-full w-full overflow-y-auto p-4 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight">Upload Location</h1>
          <p className="text-on-surface-variant mt-2">
            Pick a video, confirm the metadata, and let Interfaze extract transcript, OCR, and structured location evidence.
          </p>
        </header>

        <section className="bg-surface-container-lowest rounded-lg shadow-float p-6 lg:p-8 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2 block ml-2">
                Point of Interest
              </label>
              <input
                value={pointOfInterest}
                onChange={(e) => setPointOfInterest(e.target.value)}
                placeholder="e.g. Hidden Rooftop Cafe"
                className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm font-semibold"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2 block ml-2">
                City
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2 block ml-2">
              Address (optional)
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, district, city"
              className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm font-semibold"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2 block ml-2">
                Short description (optional)
              </label>
              <input
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="Best for sunset drinks and group photos"
                className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm font-semibold"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2 block ml-2">
                Atmosphere (optional)
              </label>
              <input
                value={atmosphere}
                onChange={(e) => setAtmosphere(e.target.value)}
                placeholder="cozy, lively, rooftop, chill..."
                className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm font-semibold"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-low p-5">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setSelectedFile(file);
                setConfirmReady(false);
                setResult(null);
                setError(null);
              }}
            />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <FileVideo className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-extrabold">
                    {selectedFile ? selectedFile.name : 'No video selected'}
                  </div>
                  <div className="text-xs text-on-surface-variant mt-1">
                    {selectedFile ? formatBytes(selectedFile.size) : 'Accepted: any video format'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface px-4 py-2.5 rounded-full text-sm font-headline font-extrabold transition-colors"
              >
                Browse files
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setConfirmReady(true)}
              disabled={!canConfirm}
              className={cn(
                'px-5 py-3 rounded-full font-headline font-extrabold text-sm transition-all',
                canConfirm
                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                  : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
              )}
            >
              Confirm selection
            </button>

            <button
              type="button"
              onClick={() => void uploadNow()}
              disabled={!canUpload}
              className={cn(
                'px-5 py-3 rounded-full font-headline font-extrabold text-sm transition-all flex items-center gap-2',
                canUpload
                  ? 'bg-gradient-to-r from-primary to-primary-container text-white active:scale-95'
                  : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
              )}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploadPhase === 'uploading'
                ? 'Uploading video…'
                : uploadPhase === 'processing'
                  ? 'Processing with Interfaze…'
                  : 'Upload now'}
            </button>
          </div>

          {confirmReady && selectedFile && !uploading && (
            <div className="rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-4 py-3 text-sm font-semibold">
              File confirmed. You can upload now.
            </div>
          )}
          {!hasRequiredFields && (
            <div className="rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 px-4 py-3 text-sm font-semibold">
              Required: video file, point of interest, and city.
            </div>
          )}

          {result && (
            <div className="rounded-xl bg-primary/10 px-4 py-4">
              <div className="flex items-center gap-2 text-primary font-extrabold">
                <CheckCircle2 className="h-4 w-4" />
                Structured extraction ready
              </div>
              <div className="text-sm mt-3 space-y-2">
                <div>
                  <span className="font-bold">Job ID:</span> {result.jobId}
                </div>
                <div>
                  <span className="font-bold">Video ID:</span> {result.videoId}
                </div>
                <div>
                  <span className="font-bold">Status:</span> {result.status}
                </div>
                {typeof result.result?.confidence === 'number' && (
                  <div>
                    <span className="font-bold">Confidence:</span> {(result.result.confidence * 100).toFixed(0)}%
                  </div>
                )}
                {result.result?.locationExplicit && (
                  <div>
                    <span className="font-bold">Explicit location:</span> {result.result.locationExplicit}
                  </div>
                )}
                {result.result?.locationGuess && (
                  <div>
                    <span className="font-bold">Guessed location:</span> {result.result.locationGuess}
                  </div>
                )}
                {result.result?.description && (
                  <div>
                    <span className="font-bold">Description:</span> {result.result.description}
                  </div>
                )}
                {result.result?.facts.length ? (
                  <div className="pt-2">
                    <div className="font-bold mb-1">Facts</div>
                    <ul className="space-y-1 text-on-surface">
                      {result.result.facts.slice(0, 4).map((fact, index) => (
                        <li key={`${fact.claim}-${index}`}>• {fact.claim}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {result.result?.evidence.length ? (
                  <div className="pt-2">
                    <div className="font-bold mb-1">Evidence</div>
                    <ul className="space-y-2 text-on-surface">
                      {result.result.evidence.slice(0, 4).map((item, index) => (
                        <li key={`${item.detail}-${index}`} className="rounded-lg bg-white/50 dark:bg-black/10 px-3 py-2">
                          <div className="text-xs uppercase tracking-wide text-on-surface-variant">
                            {item.source} · {item.kind}
                          </div>
                          <div>{item.detail}</div>
                          {item.quote && <div className="text-xs text-on-surface-variant mt-1">“{item.quote}”</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {result.result?.ocrVisualClues.length ? (
                  <div className="pt-2">
                    <div className="font-bold mb-1">Visual clues</div>
                    <div className="text-on-surface">{result.result.ocrVisualClues.slice(0, 6).join(', ')}</div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 px-4 py-3 text-sm font-semibold flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
