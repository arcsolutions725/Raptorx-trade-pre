"use client";

export default function TypingIndicator() {
  return (
    <div className="items-center gap-1.5 px-1 inline-flex">
      <div 
        className="w-1.5 h-1.5 bg-white/60 rounded-full typing-dot" 
        style={{ animationDelay: "0ms" }} 
      />
      <div 
        className="w-1.5 h-1.5 bg-white/60 rounded-full typing-dot" 
        style={{ animationDelay: "200ms" }} 
      />
      <div 
        className="w-1.5 h-1.5 bg-white/60 rounded-full typing-dot" 
        style={{ animationDelay: "400ms" }} 
      />
    </div>
  );
}

