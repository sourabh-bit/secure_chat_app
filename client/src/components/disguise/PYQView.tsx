import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSecretTrigger } from "@/hooks/use-secret-trigger";
import generatedImage from "@assets/generated_images/physics_diagram_of_projectile_motion_sketches.png";
import { Menu, ChevronLeft, ChevronRight, Search, HelpCircle } from "lucide-react";

interface PYQViewProps {
  onUnlock: () => void;
}

export function PYQView({ onUnlock }: PYQViewProps) {
  const trigger = useSecretTrigger(onUnlock);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Generate dummy questions to ensure scrollability
  const dummyQuestions = Array.from({ length: 10 }).map((_, i) => ({
    id: 394826 + i,
    qNum: i + 3,
    type: i % 3 === 0 ? "Single Correct" : i % 3 === 1 ? "Multiple Correct" : "Integer Type",
    text: i % 2 === 0 
      ? "A particle of mass m is moving in a circular path of constant radius r such that its centripetal acceleration ac is varying with time t as ac = k²rt², where k is a constant. The power delivered to the particle by the forces acting on it is:"
      : "Consider a system of two identical particles. One particle is at rest and the other has an acceleration a. The centre of mass has an acceleration:",
    options: i % 2 === 0 
      ? ["2πmk²r²t", "mk²r²t", "(mk⁴r²t⁵)/3", "Zero"] 
      : ["a/2", "a", "2a", "Zero"]
  }));

  return (
    <div className="flex h-screen w-full bg-[#f9f9f7] text-slate-900 font-serif overflow-hidden">
      {/* Sidebar - Chapter List */}
      <div 
        className={cn(
          "flex-shrink-0 bg-[#f0f0ed] border-r border-slate-200 transition-all duration-300 ease-in-out hidden md:block",
          sidebarOpen ? "w-64" : "w-0"
        )}
      >
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Physics Archive</h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {["Kinematics", "Laws of Motion", "Work, Power & Energy", "Rotational Motion", "Gravitation", "Properties of Solids", "Thermodynamics", "Oscillations", "Waves", "Electrostatics", "Current Electricity", "Magnetism", "EMI & AC", "Optics", "Modern Physics"].map((topic, i) => (
                <button 
                  key={topic}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                    i === 0 ? "bg-white shadow-sm text-blue-900 font-medium" : "text-slate-600 hover:bg-white/50"
                  )}
                >
                  {i + 1}. {topic}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <header className="h-14 border-b border-slate-200 bg-white/80 backdrop-blur-sm flex items-center px-4 justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 hover:bg-slate-100 rounded-md text-slate-600">
              <Menu size={20} />
            </button>
            <h1 className="font-semibold text-lg text-slate-800 truncate">JEE Advanced 2023 - Paper 1</h1>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
             <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
               <Search size={18} />
             </button>
          </div>
        </header>

        {/* Sub-Header / Toolbar with Help Icon (Secret Trigger) */}
        <div className="h-10 bg-slate-50 border-b border-slate-200 flex items-center justify-between px-4 text-xs text-slate-500">
          <div className="flex gap-4">
            <span className="hover:text-slate-800 cursor-pointer">Overview</span>
            <span className="hover:text-slate-800 cursor-pointer">Analytics</span>
            <span className="hover:text-slate-800 cursor-pointer font-medium text-blue-600 border-b-2 border-blue-600 h-10 flex items-center">Questions</span>
          </div>
          
          {/* The Trigger is now here on the Help icon */}
          <div className="flex items-center gap-2">
             <span className="hidden sm:inline">Need assistance?</span>
             <button 
               onClick={trigger}
               className="flex items-center gap-1 hover:bg-slate-200 px-2 py-1 rounded transition-colors"
             >
               <HelpCircle size={14} />
               <span>Help</span>
             </button>
          </div>
        </div>

        {/* Content Area */}
        <ScrollArea className="flex-1 bg-[#f9f9f7]">
          <div className="max-w-3xl mx-auto p-4 md:p-12 space-y-8 pb-32">
            
            {/* Question 1 */}
            <article className="bg-white p-6 md:p-8 rounded-sm shadow-sm border border-slate-100">
              <div className="flex items-baseline justify-between mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Q.1 • Single Correct</span>
                <span className="text-xs font-mono text-slate-400">ID: 394821</span>
              </div>
              
              <div className="prose prose-slate max-w-none">
                <p className="mb-4 text-lg leading-relaxed text-slate-800">
                  A projectile is fired from the origin O at an angle of 45° with the horizontal. At the highest point P of its trajectory, the radial and transverse components of its acceleration with respect to P are:
                </p>
                
                <div className="my-6 p-4 bg-slate-50 border border-slate-100 rounded flex justify-center">
                  <img 
                    src={generatedImage} 
                    alt="Projectile Diagram" 
                    className="max-h-64 mix-blend-multiply opacity-90"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {["Radial: g, Transverse: 0", "Radial: 0, Transverse: g", "Radial: g/√2, Transverse: g/√2", "Radial: g/2, Transverse: g/2"].map((opt, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded border border-slate-200 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all group">
                      <span className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center text-xs font-medium text-slate-500 group-hover:border-blue-400 group-hover:text-blue-600">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-slate-700 font-medium">{opt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            {/* Question 2 */}
            <article className="bg-white p-6 md:p-8 rounded-sm shadow-sm border border-slate-100">
              <div className="flex items-baseline justify-between mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Q.2 • Multiple Correct</span>
                <span className="text-xs font-mono text-slate-400">ID: 394825</span>
              </div>
              <div className="prose prose-slate max-w-none">
                <p className="mb-4 text-lg leading-relaxed text-slate-800">
                  A thin uniform rod of mass M and length L is hinged at one end O. It is released from rest from a horizontal position. When it becomes vertical:
                </p>
                <div className="space-y-2 mt-4">
                   {["The angular velocity is √(3g/L)", "The angular momentum about O is M√(gL³)", "The force applied by the hinge is 5Mg/2", "The force applied by the hinge is 3Mg/2"].map((opt, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded border border-slate-200 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all group">
                      <span className="w-6 h-6 rounded-sm border border-slate-300 flex items-center justify-center text-xs font-medium text-slate-500 group-hover:border-blue-400 group-hover:text-blue-600">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-slate-700 font-medium">{opt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            {/* Generated Filler Questions */}
            {dummyQuestions.map((q) => (
              <article key={q.id} className="bg-white p-6 md:p-8 rounded-sm shadow-sm border border-slate-100">
                <div className="flex items-baseline justify-between mb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Q.{q.qNum} • {q.type}</span>
                  <span className="text-xs font-mono text-slate-400">ID: {q.id}</span>
                </div>
                <div className="prose prose-slate max-w-none">
                  <p className="mb-4 text-lg leading-relaxed text-slate-800">{q.text}</p>
                  <div className="grid grid-cols-1 gap-3 mt-4">
                    {q.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded border border-slate-200 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all group">
                        <span className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center text-xs font-medium text-slate-500 group-hover:border-blue-400 group-hover:text-blue-600">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="text-slate-700 font-medium">{opt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}

          </div>
        </ScrollArea>
        
        <div className="h-12 border-t border-slate-200 bg-white flex items-center justify-between px-4 text-sm text-slate-500">
           <button className="flex items-center gap-1 hover:text-slate-800"><ChevronLeft size={16}/> Previous</button>
           <span className="font-mono text-xs">Page 1 of 14</span>
           <button className="flex items-center gap-1 hover:text-slate-800">Next <ChevronRight size={16}/></button>
        </div>
      </div>
    </div>
  );
}
