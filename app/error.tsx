"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, LogOut } from "lucide-react";

interface ErrorProps {
  reset: () => void;
}

export default function Error({ reset }: ErrorProps) {
  // Read on the first render; an effect would show zero for one paint.
  const [refreshCount, setRefreshCount] = useState(() =>
    typeof window === "undefined"
      ? 0
      : parseInt(localStorage.getItem('error-refresh-count') || '0')
  );

  const handleRefresh = () => {
    const newCount = refreshCount + 1;
    setRefreshCount(newCount);
    localStorage.setItem('error-refresh-count', newCount.toString());
    reset();
  };

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border-2 border-orange-200 shadow-sm">
          <CardContent className="pt-8 pb-6 px-6">
            <div className="text-center space-y-6">

              
              <div className="mx-auto w-40 h-40">
                <svg
                  viewBox="0 0 160 160"
                  className="w-full h-full"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    fill="#FED7AA"
                    className="animate-pulse"
                  />

                  
                  <circle
                    cx="80"
                    cy="80"
                    r="45"
                    fill="#FFFFFF"
                    stroke="#F97316"
                    strokeWidth="4"
                  />

                  
                  <circle
                    cx="80"
                    cy="80"
                    r="40"
                    fill="#FFFFFF"
                  />

                  
                  <path
                    d="M50 60 L90 100 M70 45 L85 85 M95 65 L65 95"
                    stroke="#F97316"
                    strokeWidth="2"
                    opacity="0.6"
                  />

                  
                  <text x="80" y="50" fontSize="12" textAnchor="middle" fill="#A07553" fontWeight="bold">12</text>
                  <text x="105" y="85" fontSize="12" textAnchor="middle" fill="#F97316" fontWeight="bold">3</text>
                  <text x="80" y="115" fontSize="12" textAnchor="middle" fill="#A07553" fontWeight="bold">6</text>
                  <text x="55" y="85" fontSize="12" textAnchor="middle" fill="#F97316" fontWeight="bold">?</text>

                  
                  <g transform="translate(80, 80)">
                    
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="-20"
                      stroke="#A07553"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <line
                      x1="0"
                      y1="-20"
                      x2="5"
                      y2="-25"
                      stroke="#F97316"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />

                    
                    <line
                      x1="0"
                      y1="0"
                      x2="25"
                      y2="0"
                      stroke="#F97316"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="animate-spin"
                      style={{ transformOrigin: '0 0' }}
                    />
                  </g>

                  
                  <circle
                    cx="80"
                    cy="80"
                    r="3"
                    fill="#A07553"
                  />

                  
                  <g className="animate-bounce" style={{ animationDelay: '0s' }}>
                    <ellipse cx="40" cy="40" rx="18" ry="10" fill="#F97316" opacity="0.8"/>
                    <text x="40" y="44" fontSize="8" textAnchor="middle" fill="white" fontWeight="bold">TIME OUT!</text>
                  </g>

                  <g className="animate-bounce" style={{ animationDelay: '0.7s' }}>
                    <ellipse cx="120" cy="50" rx="16" ry="8" fill="#A07553" opacity="0.8"/>
                    <text x="120" y="53" fontSize="7" textAnchor="middle" fill="white" fontWeight="bold">GLITCH</text>
                  </g>

                  <g className="animate-bounce" style={{ animationDelay: '1.4s' }}>
                    <ellipse cx="130" cy="110" rx="20" ry="9" fill="#F97316" opacity="0.8"/>
                    <text x="130" y="114" fontSize="7" textAnchor="middle" fill="white" fontWeight="bold">SYSTEM ERROR</text>
                  </g>

                  
                  <g className="animate-pulse">
                    <circle cx="65" cy="55" r="2" fill="#F97316"/>
                    <circle cx="95" cy="70" r="1.5" fill="#EA580C"/>
                    <circle cx="75" cy="105" r="2" fill="#F97316"/>
                  </g>
                </svg>
              </div>

              
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-black">
                  Things Are Getting Heated Backstage
                </h1>
                <p className="text-gray-600 text-sm">
                  Tech drama, just off-stage — we’re on it!
                </p>
              </div>

              
              <div className="space-y-3">
                {refreshCount < 2 ? (
                  <div className="space-y-2">
                    <Button
                      onClick={handleRefresh}
                      className="w-full bg-[#F97316] hover:bg-[#EA580C] text-white"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Let&#39;s reboot this debate {refreshCount > 0 && `(${refreshCount}/2)`}
                    </Button>

                    {refreshCount > 0 && (
                      <p className="text-xs text-gray-500">
                        Attempt {refreshCount} of 2
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <p className="text-xs text-orange-800">
                        <strong>The backstage argument is still unresolved…</strong><br/>
                        It might be time for a breather. Try logging out and rejoining after a short break — a fresh start can work wonders.
                      </p>
                    </div>

                    <Button
                      onClick={handleLogout}
                      variant="outline"
                      className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Start fresh
                    </Button>

                    <Button
                      onClick={handleRefresh}
                      className="w-full bg-[#F97316] hover:bg-[#EA580C] text-white"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      One final rebuttal attempt
                    </Button>
                  </div>
                )}
              </div>

              
              <div className="pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Thanks for bearing with us — if the glitch drags on, our tech crew is standing by to step in.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}