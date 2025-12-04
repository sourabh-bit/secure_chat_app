import React, { memo, useCallback } from "react";
import { Check, CheckCheck, Clock, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { AudioPlayer } from "./AudioPlayer";

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
  onLongPress: (id: string, e: any) => void;
  onReply: (msg: Message) => void;
}

export default memo(function ChatMessage({
  message: msg,
  isSelected,
  isSelectMode,
  onSelect,
  onLongPress,
  onReply,
}: Props) {
  const handleClick = useCallback(() => {
    if (isSelectMode) onSelect(msg.id);
  }, [isSelectMode, msg.id, onSelect]);

  const handleLongPress = (e: any) => {
    if (!isSelectMode) onLongPress(msg.id, e);
  };

  return (
    <div
      className={cn(
        "w-full px-3 sm:px-4 mb-2 flex",
        msg.sender === "me" ? "justify-end" : "justify-start"
      )}
      onClick={handleClick}
      onTouchStart={handleLongPress}
      onMouseDown={handleLongPress}
    >
      {/* Selection Checkbox */}
      {isSelectMode && (
        <div
          className={cn(
            "flex items-center px-2",
            msg.sender === "me" ? "order-2" : "order-first"
          )}
        >
          <div
            className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center",
              isSelected
                ? "bg-emerald-500 border-emerald-500"
                : "border-zinc-500"
            )}
          >
            {isSelected && <Check size={12} className="text-white" />}
          </div>
        </div>
      )}

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[80%] sm:max-w-[70%] md:max-w-[60%] px-3 py-2 rounded-2xl shadow",
          msg.sender === "me"
            ? "bg-[#128C7E] text-white rounded-br-sm"
            : "bg-[#1f2c33] text-white rounded-bl-sm border border-white/10"
        )}
      >
        {/* Reply Preview */}
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

        {/* TEXT */}
        {msg.type === "text" && (
          <p className="text-[14px] leading-[1.4] whitespace-pre-wrap break-words">
            {msg.text}
          </p>
        )}

        {/* IMAGE */}
        {msg.type === "image" && msg.mediaUrl && (
          <img
            src={msg.mediaUrl}
            className="rounded-xl max-h-72 w-full object-cover mt-1 cursor-pointer"
            onClick={() => onReply(msg)}
          />
        )}

        {/* VIDEO */}
        {msg.type === "video" && msg.mediaUrl && (
          <video
            src={msg.mediaUrl}
            className="rounded-xl max-h-72 w-full mt-1"
            controls
          />
        )}

        {/* AUDIO */}
        {msg.type === "audio" && msg.mediaUrl && (
          <AudioPlayer audioUrl={msg.mediaUrl} isOwn={msg.sender === "me"} />
        )}

        {/* FOOTER */}
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
