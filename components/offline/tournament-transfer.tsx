"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TransferReview } from "./transfer-review";
import {
  ALL_ENTITY_TYPES,
  buildBundle,
  deviceId,
  prepareReview,
  validateBundle,
  type Bundle,
  type ReviewItem,
} from "@/lib/offline/bundle";
import { applyReview } from "@/lib/offline/bundle-apply";
import {
  ChunkCollector,
  bundleFileName,
  bundleToBlob,
  chunkBundle,
  describeFileRejection,
  encodeChunk,
  parseBundleFile,
} from "@/lib/offline/transport";

/** How long each QR frame is shown before the next, in milliseconds. */
const FRAME_INTERVAL = 700;

interface TournamentTransferProps {
  tournamentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TournamentTransfer({
  tournamentId,
  open,
  onOpenChange,
}: TournamentTransferProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Transfer tournament data</DialogTitle>
          <DialogDescription>
            Move pairings, ballots, teams, lineups, rankings and payments between devices
            without a connection.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="send">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="send">Send</TabsTrigger>
            <TabsTrigger value="receive">Receive</TabsTrigger>
          </TabsList>

          <TabsContent value="send" className="pt-4">
            <SendPanel tournamentId={tournamentId} />
          </TabsContent>

          <TabsContent value="receive" className="pt-4">
            <ReceivePanel
              tournamentId={tournamentId}
              onDone={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SendPanel({ tournamentId }: { tournamentId: string }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [building, setBuilding] = useState(false);

  const build = useCallback(async () => {
    setBuilding(true);

    try {
      const built = await buildBundle({ tournamentId, include: ALL_ENTITY_TYPES });

      if (built.entities.length === 0) {
        toast.error("There is nothing stored on this device for this tournament yet.");
        return;
      }

      const chunks = chunkBundle(built);

      const rendered = await Promise.all(
        chunks.map((chunk) =>
          QRCode.toDataURL(encodeChunk(chunk), { errorCorrectionLevel: "M", margin: 1, width: 320 })
        )
      );

      setBundle(built);
      setFrames(rendered);
      setFrameIndex(0);
    } catch {
      toast.error("Could not prepare the transfer.");
    } finally {
      setBuilding(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (frames.length <= 1) return;

    const timer = window.setInterval(
      () => setFrameIndex((current) => (current + 1) % frames.length),
      FRAME_INTERVAL
    );

    return () => window.clearInterval(timer);
  }, [frames.length]);

  const download = () => {
    if (!bundle) return;

    const url = URL.createObjectURL(bundleToBlob(bundle));
    const link = document.createElement("a");

    link.href = url;
    link.download = bundleFileName(bundle);
    link.click();

    URL.revokeObjectURL(url);
  };

  if (!bundle) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-center text-sm text-muted-foreground">
          Everything this device holds for the tournament will be packaged for transfer.
        </p>
        <Button onClick={build} disabled={building}>
          {building ? "Preparing…" : "Prepare transfer"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Badge variant="secondary">{bundle.entities.length} records</Badge>
        {frames.length > 1 && (
          <Badge>
            Code {frameIndex + 1} of {frames.length}
          </Badge>
        )}
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={frames[frameIndex]}
        alt={`Transfer code ${frameIndex + 1} of ${frames.length}`}
        className="size-64 rounded bg-white p-2 sm:size-80"
      />

      {frames.length > 1 && (
        <>
          <Progress value={((frameIndex + 1) / frames.length) * 100} className="w-full" />
          <p className="text-center text-xs text-muted-foreground">
            Keep the other device pointed here until every code has been scanned. They cycle
            automatically and may be scanned in any order.
          </p>
        </>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={download}>
          Save as file
        </Button>
        <Button variant="ghost" onClick={build} disabled={building}>
          Rebuild
        </Button>
      </div>
    </div>
  );
}

function ReceivePanel({
  tournamentId,
  onDone,
}: {
  tournamentId: string;
  onDone: () => void;
}) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ received: 0, total: 0 });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const collectorRef = useRef(new ChunkCollector());
  const frameRef = useRef<number | null>(null);

  const stopScanning = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    setScanning(false);
  }, []);

  const receive = useCallback(
    async (bundle: Bundle) => {
      const validation = validateBundle(bundle, {
        tournamentId,
        deviceId: deviceId(),
      });

      if (!validation.valid) {
        toast.error(validation.message);
        return;
      }

      setItems(await prepareReview(bundle));
    },
    [tournamentId]
  );

  useEffect(() => stopScanning, [stopScanning]);

  const startScanning = useCallback(async () => {
    collectorRef.current.reset();
    setProgress({ received: 0, total: 0 });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      streamRef.current = stream;
      setScanning(true);

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();

      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      const tick = () => {
        if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) {
          frameRef.current = requestAnimationFrame(tick);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height);

        if (found) {
          const result = collectorRef.current.accept(found.data);
          setProgress({ received: result.received, total: result.total });

          if (result.error) {
            toast.error(result.error);
            collectorRef.current.reset();
          } else if (result.bundle) {
            stopScanning();
            void receive(result.bundle);
            return;
          }
        }

        frameRef.current = requestAnimationFrame(tick);
      };

      frameRef.current = requestAnimationFrame(tick);
    } catch {
      toast.error("The camera could not be opened. Use a file transfer instead.");
      setScanning(false);
    }
  }, [receive, stopScanning]);

  const readFile = async (file: File) => {
    const result = parseBundleFile(await file.text());

    if (!result.bundle) {
      toast.error(describeFileRejection(result.rejection!));
      return;
    }

    await receive(result.bundle);
  };

  const apply = async (accepted: ReviewItem[]) => {
    setApplying(true);

    try {
      const result = await applyReview(
        accepted,
        new Set(accepted.map((item) => item.entity.id))
      );

      toast.success(`Applied ${result.accepted} of ${accepted.length} records`);

      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} could not be applied.`);
      }

      setItems(null);
      onDone();
    } catch {
      toast.error("Nothing was applied.");
    } finally {
      setApplying(false);
    }
  };

  if (items) {
    return (
      <TransferReview
        items={items}
        applying={applying}
        onApply={apply}
        onCancel={() => setItems(null)}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <video
        ref={videoRef}
        className={scanning ? "w-full max-w-sm rounded" : "hidden"}
        muted
        playsInline
      />

      {scanning && progress.total > 0 && (
        <div className="w-full max-w-sm">
          <Progress value={(progress.received / progress.total) * 100} />
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {progress.received} of {progress.total} codes scanned
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {scanning ? (
          <Button variant="outline" onClick={stopScanning}>
            Stop scanning
          </Button>
        ) : (
          <Button onClick={startScanning}>Scan codes</Button>
        )}

        <Button variant="outline" asChild>
          <label>
            Open a file
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = "";
              }}
            />
          </label>
        </Button>
      </div>

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Nothing is applied until you have reviewed it. You choose what to take.
      </p>
    </div>
  );
}
