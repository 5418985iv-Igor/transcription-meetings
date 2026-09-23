'use client';

import React, { useRef, useState, useCallback } from 'react';
import { UploadCloud, Music, X, Play, Pause, ArrowRight, AlertCircle } from 'lucide-react';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB safe web limit

interface AudioUploaderProps {
  onStartUpload: (file: File) => void;
  disabled: boolean;
}

export function AudioUploader({ onStartUpload, disabled }: AudioUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    
    // Accept audio formats
    setSelectedFile(file);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setIsPlaying(false);
  }, [audioUrl]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleClear = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setSelectedFile(null);
    setAudioUrl(null);
    setIsPlaying(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const togglePlay = () => {
    if (!audioPlayerRef.current) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const isFileTooLarge = selectedFile ? selectedFile.size > MAX_FILE_SIZE_BYTES : false;

  const handleSubmit = () => {
    if (selectedFile && !disabled && !isFileTooLarge) {
      onStartUpload(selectedFile);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
      <input
        ref={fileInputRef}
        type="file"
        id="audio-file-input"
        accept="audio/*,.m4a,.mp3,.wav,.ogg,.aac,.flac,.webm"
        className="hidden"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {!selectedFile ? (
        <div
          id="dropzone-area"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center ${
            dragActive
              ? 'border-indigo-500 bg-indigo-50/50'
              : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/70'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
            <UploadCloud className="w-7 h-7" />
          </div>

          <h3 className="text-base font-semibold text-slate-900 mb-1">
            Выберите аудиозапись совещания
          </h3>
          <p className="text-sm text-slate-500 max-w-md mb-4">
            Перетащите файл сюда или нажмите для выбора на компьютере. Поддерживаются форматы M4A, MP3, WAV, AAC, OGG (до 100 МБ).
          </p>

          <button
            type="button"
            id="browse-files-btn"
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors pointer-events-none"
          >
            <Music className="w-4 h-4" />
            Выбрать файл
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-lg bg-indigo-600/10 text-indigo-600 flex items-center justify-center shrink-0">
                <Music className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate" title={selectedFile.name}>
                  {selectedFile.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className={isFileTooLarge ? 'text-amber-600 font-semibold' : ''}>
                    {formatFileSize(selectedFile.size)}
                  </span>
                  <span>•</span>
                  <span className="uppercase">{selectedFile.name.split('.').pop() || 'AUDIO'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {audioUrl && (
                <button
                  type="button"
                  id="preview-play-btn"
                  onClick={togglePlay}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-indigo-600" />
                      Пауза
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-indigo-600" />
                      Прослушать
                    </>
                  )}
                </button>
              )}

              {!disabled && (
                <button
                  type="button"
                  id="remove-file-btn"
                  onClick={handleClear}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-all"
                  title="Удалить выбранный файл"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Warning when file exceeds 100MB */}
          {isFileTooLarge && (
            <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">
                  Размер файла ({formatFileSize(selectedFile.size)}) превышает лимит веб-загрузки (100 МБ)
                </p>
                <p className="text-amber-700">
                  Облачный веб-сервер принимает аудиофайлы размером до 100 МБ. Чтобы передать даже многочасовую запись, сохраните её в формате <strong>M4A (AAC 32–64 kbps)</strong> или <strong>MP3</strong> (в таком виде 1 час занимает всего 15–25 МБ).
                </p>
              </div>
            </div>
          )}

          {/* Hidden audio element for preview */}
          {audioUrl && (
            <audio
              ref={audioPlayerRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
          )}

          {/* Start CTA Button */}
          <div className="flex justify-end">
            <button
              type="button"
              id="start-process-btn"
              onClick={handleSubmit}
              disabled={disabled || isFileTooLarge}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
            >
              <span>Начать обработку</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
