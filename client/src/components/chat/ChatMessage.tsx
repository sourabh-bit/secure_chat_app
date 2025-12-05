import React, { memo, useCallback, useRef, useState } from "react";
import { Check, CheckCheck, Clock, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { AudioPlayer } from "./AudioPlayer";
import { useLongPress } from "@/hooks/use-long-press";

interface Message {
  id: string;
  text: string;
  sender: "me" | "them";
  timestamp: Date;
  type: "text" | "image" | "video" | "audio";
  mediaUrl?: string;
  status?: "sending" | "sent" | "delivered" | "read";
  replyTo?: {
    id: string;
    text: string;
    sender: "me" | "them";
  };
}

interface Props {
  message: Message;
  isSelected: boolean;
  isSelectMode: boolean;
  onSelect: (id: string) => void;
  onLongPress: (id: string) => void;
  onReply: (msg: Message) => void;
  onSwipeReply: (msg: Message) => void;
}

// Memoize with custom comparison to prevent unnecessary re-renders
export default memo(function ChatMessage({
  message: msg,
  isSelected,
  isSelectMode,
  onSelect,
  onLongPress,
  onReply,
  onSwipeReply,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPressing, setIsPressing] = useState(false);
  const [startX, setStartX] = useState<number | null>(null);
  const [startY, setStartY] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeThreshold = 35;

  const [startXPointer, setStartXPointer] = useState<number | null>(null);
  const [startYPointer, setStartYPointer] = useState<number | null>(null);
  const [isSwipingPointer, setIsSwipingPointer] = useState(false);
  const [swipeOffsetPointer, setSwipeOffsetPointer] = useState(0);
  const [replyTriggered, setReplyTriggered] = useState(false);
  const [replyTriggeredPointer, setReplyTriggeredPointer] = useState(false);

  const handleClick = useCallback(() => {
    if (isSelectMode) {
      onSelect(msg.id);
    }
  }, [isSelectMode, msg.id, onSelect]);

  const handleLongPress = useCallback(() => {
    if (!isSelectMode) {
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
      onLongPress(msg.id);
    }
    setIsPressing(false);
  }, [isSelectMode, msg.id, onLongPress]);

  const longPressHandlers = useLongPress({
    onLongPress: handleLongPress,
    onClick: handleClick,
    threshold: 350,
    moveThreshold: 15,
  });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsPressing(true);
    setStartXPointer(e.clientX);
    setStartYPointer(e.clientY);
    setIsSwipingPointer(false);
    longPressHandlers.onPointerDown(e);
  }, [longPressHandlers]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsPressing(false);
    if (isSwipingPointer && startXPointer !== null) {
      const deltaX = e.clientX - startXPointer;
      if (deltaX > swipeThreshold && !replyTriggeredPointer) {
        onSwipeReply(msg);
      }
    }
    if (!replyTriggeredPointer) {
      setSwipeOffsetPointer(0);
    }
    setStartXPointer(null);
    setStartYPointer(null);
    setIsSwipingPointer(false);
    setReplyTriggeredPointer(false);
    longPressHandlers.onPointerUp();
  }, [longPressHandlers, replyTriggeredPointer, isSwipingPointer, startXPointer, swipeThreshold, onSwipeReply, msg]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    setIsPressing(false);
    setStartXPointer(null);
    setStartYPointer(null);
    setIsSwipingPointer(false);
    setSwipeOffsetPointer(0);
    setReplyTriggeredPointer(false);
    longPressHandlers.onPointerCancel();
  }, [longPressHandlers]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (startXPointer === null || startYPointer === null) return;
    const deltaX = e.clientX - startXPointer;
    const deltaY = Math.abs(e.clientY - startYPointer);

    if (deltaY < 20 && Math.abs(deltaX) > 10 && !isSwipingPointer) {
      setIsSwipingPointer(true);
    }

    if (isSwipingPointer) {
      e.preventDefault();
      const offset = Math.max(0, Math.min(deltaX, 80));
      setSwipeOffsetPointer(offset);
      if (deltaX > 35 && !replyTriggeredPointer) {
        setReplyTriggeredPointer(true);
        onSwipeReply(msg);
      }
    } else {
      longPressHandlers.onPointerMove(e);
    }
  }, [startXPointer, startYPointer, isSwipingPointer, replyTriggeredPointer, onSwipeReply, msg, longPressHandlers]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setStartY(e.touches[0].clientY);
    setIsSwiping(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (startX === null || startY === null) return;
    const deltaX = e.touches[0].clientX - startX;
    const deltaY = Math.abs(e.touches[0].clientY - startY);

    if (deltaY < 20 && Math.abs(deltaX) > 10 && !isSwiping) {
      setIsSwiping(true);
    }

    if (isSwiping) {
      e.preventDefault();
      const offset = Math.max(0, Math.min(deltaX, 80)); // Max 80px offset
      setSwipeOffset(offset);
      if (deltaX > 35 && !replyTriggered) {
        setReplyTriggered(true);
        onSwipeReply(msg);
      }
    }
  }, [startX, startY, isSwiping, replyTriggered, onReply, msg]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isSwiping && startX !== null) {
      const deltaX = e.changedTouches[0].clientX - startX;
      if (deltaX > swipeThreshold && !replyTriggered) {
        onSwipeReply(msg);
      }
    }
    setStartX(null);
    setStartY(null);
    setIsSwiping(false);
    setSwipeOffset(0);
    setReplyTriggered(false);
  }, [isSwiping, startX, swipeOffset, swipeThreshold, replyTriggered, onSwipeReply, msg]);

  const handleMediaClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isSelectMode) {
        onReply(msg);
      }
    },
    [isSelectMode, msg, onReply]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full px-3 sm:px-4 mb-1.5 flex no-select",
        "transition-all duration-150 ease-out",
        msg.sender === "me" ? "justify-end" : "justify-start",
        isSelected && "message-selected",
        isPressing && !isSelectMode && "scale-[0.98] opacity-90"
      )}
      style={{
        touchAction: isSelectMode ? "none" : "pan-y",
        transform: (swipeOffset > 0 ? `translateX(${swipeOffset}px)` : undefined) || (swipeOffsetPointer > 0 ? `translateX(${swipeOffsetPointer}px)` : undefined),
        transition: (isSwiping || isSwipingPointer) ? 'none' : 'transform 0.2s ease-out'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      onContextMenu={longPressHandlers.onContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {isSelectMode && (
        <div
          className={cn(
            "flex items-center px-2 transition-transform duration-200",
            msg.sender === "me" ? "order-2" : "order-first",
            isSelected ? "scale-110" : "scale-100"
          )}
        >
          <div
            className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200",
              isSelected
                ? "bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/30"
                : "border-zinc-500 bg-transparent"
            )}
          >
            {isSelected && <Check size={12} className="text-white" />}
          </div>
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] sm:max-w-[70%] md:max-w-[60%] px-3 py-2 rounded-2xl shadow-sm",
          "transition-all duration-150 ease-out",
          msg.sender === "me"
            ? "bg-[#128C7E] text-white rounded-br-sm"
            : "bg-[#1f2c33] text-white rounded-bl-sm border border-white/10",
          isSelected && "ring-2 ring-emerald-500/50"
        )}
      >
        {msg.replyTo && (
          <div
            className={cn(
              "mb-2 px-2 py-1 rounded-lg border-l-2 text-xs",
              msg.sender === "me"
                ? "bg-white/10 border-white/50"
                : "bg-black/20 border-emerald-500"
            )}
          >
            <p className="font-medium opacity-80">
              {msg.replyTo.sender === "me" ? "You" : "Them"}
            </p>
            <p className="opacity-70 truncate">{msg.replyTo.text}</p>
          </div>
        )}

        {msg.type === "text" && (
          <p className="text-[14px] leading-[1.4] whitespace-pre-wrap break-words">
            {msg.text}
          </p>
        )}

        {msg.type === "image" && msg.mediaUrl && (
          <img
            src={msg.mediaUrl}
            alt="Shared image"
            className="rounded-xl max-h-72 w-full object-cover mt-1 cursor-pointer"
            onClick={handleMediaClick}
            draggable={false}
          />
        )}

        {msg.type === "video" && msg.mediaUrl && (
          <video
            src={msg.mediaUrl}
            className="rounded-xl max-h-72 w-full mt-1"
            controls
          />
        )}

        {msg.type === "audio" && msg.mediaUrl && (
          <AudioPlayer audioUrl={msg.mediaUrl} isOwn={msg.sender === "me"} />
        )}

        <div className="flex items-center justify-end gap-1 mt-1 opacity-80 text-[11px]">
          <span>{format(new Date(msg.timestamp), "h:mm a")}</span>

          {msg.sender === "me" && (
            <>
              {msg.status === "sending" && <Clock size={12} />}
              {msg.status === "sent" && <Check size={12} />}
              {msg.status === "delivered" && <CheckCheck size={12} />}
              {msg.status === "read" && (
                <CheckCheck size={12} className="text-sky-400" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});
