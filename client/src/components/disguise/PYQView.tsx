import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSecretTrigger } from "@/hooks/use-secret-trigger";
import generatedImage from "@assets/generated_images/physics_diagram_of_projectile_motion_sketches.png";
import { Menu, ChevronLeft, ChevronRight, Search } from "lucide-react";

interface PYQViewProps {
  onUnlock: () => void;
}

export function PYQView({ onUnlock }: PYQViewProps) {
  const trigger = useSecretTrigger(onUnlock);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ---------------------------
  // UPDATED: 48 unique 11th grade Maths JEE Mains questions
  // ---------------------------
  const dummyQuestions = [
    {
      id: 394826,
      qNum: 3,
      type: "Single Correct",
      text: "If α and β are the roots of the equation x² - 3x + 2 = 0, then the equation whose roots are α² and β² is:",
      options: ["x² - 5x + 4 = 0", "x² - 7x + 10 = 0", "x² - 5x + 6 = 0", "x² - 7x + 12 = 0"],
    },
    {
      id: 394827,
      qNum: 4,
      type: "Multiple Correct",
      text: "For the quadratic equation x² + px + q = 0, if p and q are real numbers and the roots are real and equal, then:",
      options: ["p² = 4q", "p = 2√q", "q > 0", "p < 0"],
    },
    {
      id: 394828,
      qNum: 5,
      type: "Integer Type",
      text: "The number of terms in the expansion of (1 + x)^10 is:",
      options: [],
    },
    {
      id: 394829,
      qNum: 6,
      type: "Single Correct",
      text: "The coefficient of x^3 in the expansion of (1 + x + x²)^5 is:",
      options: ["10", "15", "20", "25"],
    },
    {
      id: 394830,
      qNum: 7,
      type: "Multiple Correct",
      text: "In an arithmetic progression, if the first term is a and common difference is d, then the nth term is:",
      options: ["a + (n-1)d", "a + nd", "a - (n-1)d", "a - nd"],
    },
    {
      id: 394831,
      qNum: 8,
      type: "Single Correct",
      text: "The sum of the first 20 terms of the series 1 + 3 + 5 + ... is:",
      options: ["400", "200", "100", "50"],
    },
    {
      id: 394832,
      qNum: 9,
      type: "Integer Type",
      text: "The value of n for which the sum of the first n natural numbers is 5050 is:",
      options: [],
    },
    {
      id: 394833,
      qNum: 10,
      type: "Single Correct",
      text: "The general term of the sequence 1, 4, 9, 16, ... is:",
      options: ["n²", "n", "2n", "n³"],
    },
    {
      id: 394834,
      qNum: 11,
      type: "Multiple Correct",
      text: "For the function f(x) = x² - 4x + 3, which of the following are true?",
      options: ["f(1) = 0", "f(3) = 0", "Minimum value is -1", "Maximum value is 3"],
    },
    {
      id: 394835,
      qNum: 12,
      type: "Single Correct",
      text: "The derivative of x³ with respect to x is:",
      options: ["3x²", "x²", "3x", "x³"],
    },
    {
      id: 394836,
      qNum: 13,
      type: "Single Correct",
      text: "The integral of 2x dx is:",
      options: ["x² + c", "2x² + c", "x + c", "2x + c"],
    },
    {
      id: 394837,
      qNum: 14,
      type: "Multiple Correct",
      text: "In coordinate geometry, the distance between points (1,2) and (3,4) is:",
      options: ["√8", "2√2", "4", "√4"],
    },
    {
      id: 394838,
      qNum: 15,
      type: "Integer Type",
      text: "The number of ways to choose 2 items from 5 distinct items is:",
      options: [],
    },
    {
      id: 394839,
      qNum: 16,
      type: "Single Correct",
      text: "The probability of getting a head when a fair coin is tossed is:",
      options: ["1/2", "1/4", "1", "0"],
    },
    {
      id: 394840,
      qNum: 17,
      type: "Multiple Correct",
      text: "For a matrix A = [2 1; 1 2], which of the following are true?",
      options: ["det(A) = 3", "A is symmetric", "A is invertible", "trace(A) = 4"],
    },
    {
      id: 394841,
      qNum: 18,
      type: "Single Correct",
      text: "The solution of the differential equation dy/dx = 2x is:",
      options: ["y = x² + c", "y = 2x + c", "y = x + c", "y = 2x² + c"],
    },
    {
      id: 394842,
      qNum: 19,
      type: "Single Correct",
      text: "The angle between vectors i and j is:",
      options: ["90°", "0°", "180°", "45°"],
    },
    {
      id: 394843,
      qNum: 20,
      type: "Multiple Correct",
      text: "In trigonometry, sin(90° - θ) = cos θ, and cos(90° - θ) = sin θ. Which of the following are identities?",
      options: ["sin²θ + cos²θ = 1", "tanθ = sinθ/cosθ", "secθ = 1/cosθ", "cotθ = cosθ/sinθ"],
    },
    {
      id: 394844,
      qNum: 21,
      type: "Integer Type",
      text: "The number of subsets of a set with 3 elements is:",
      options: [],
    },
    {
      id: 394845,
      qNum: 22,
      type: "Single Correct",
      text: "The limit of (x² - 1)/(x - 1) as x approaches 1 is:",
      options: ["2", "1", "0", "undefined"],
    },
    {
      id: 394846,
      qNum: 23,
      type: "Multiple Correct",
      text: "For the function f(x) = |x|, which of the following are true?",
      options: ["f is continuous everywhere", "f is differentiable at x=0", "f'(x) = 1 for x > 0", "f'(x) = -1 for x < 0"],
    },
    {
      id: 394847,
      qNum: 24,
      type: "Single Correct",
      text: "The area under the curve y = x from 0 to 1 is:",
      options: ["1/2", "1", "2", "0"],
    },
    {
      id: 394848,
      qNum: 25,
      type: "Integer Type",
      text: "The number of diagonals in a hexagon is:",
      options: [],
    },
    {
      id: 394849,
      qNum: 26,
      type: "Single Correct",
      text: "The mean of the numbers 1, 2, 3, 4, 5 is:",
      options: ["3", "2", "4", "5"],
    },
    {
      id: 394850,
      qNum: 27,
      type: "Multiple Correct",
      text: "In 3D geometry, the distance from point (1,2,3) to the origin is:",
      options: ["√14", "√11", "√13", "√12"],
    },
    {
      id: 394851,
      qNum: 28,
      type: "Single Correct",
      text: "The binomial coefficient C(5,2) is:",
      options: ["10", "5", "15", "20"],
    },
    {
      id: 394852,
      qNum: 29,
      type: "Single Correct",
      text: "The derivative of e^x is:",
      options: ["e^x", "x e^x", "1/e^x", "ln x"],
    },
    {
      id: 394853,
      qNum: 30,
      type: "Integer Type",
      text: "The number of ways to arrange 3 distinct books on a shelf is:",
      options: [],
    },
    {
      id: 394854,
      qNum: 31,
      type: "Single Correct",
      text: "The value of sin(30°) is:",
      options: ["1/2", "√3/2", "1", "0"],
    },
    {
      id: 394855,
      qNum: 32,
      type: "Multiple Correct",
      text: "For the complex number z = 3 + 4i, which of the following are true?",
      options: ["|z| = 5", "arg(z) = tan⁻¹(4/3)", "Re(z) = 3", "Im(z) = 4"],
    },
    {
      id: 394856,
      qNum: 33,
      type: "Integer Type",
      text: "The number of solutions to the equation x² - 5x + 6 = 0 is:",
      options: [],
    },
    {
      id: 394857,
      qNum: 34,
      type: "Single Correct",
      text: "The determinant of the matrix [1 2; 3 4] is:",
      options: ["-2", "2", "6", "8"],
    },
    {
      id: 394858,
      qNum: 35,
      type: "Multiple Correct",
      text: "In permutations, the number of ways to arrange 4 distinct letters is:",
      options: ["24", "12", "6", "4"],
    },
    {
      id: 394859,
      qNum: 36,
      type: "Single Correct",
      text: "The expansion of (a + b)^3 is:",
      options: ["a³ + 3a²b + 3ab² + b³", "a³ + a²b + ab² + b³", "a³ + 2a²b + 2ab² + b³", "a³ + b³"],
    },
    {
      id: 394860,
      qNum: 37,
      type: "Integer Type",
      text: "The sum of the geometric series 1 + 2 + 4 + ... up to 10 terms is:",
      options: [],
    },
    {
      id: 394861,
      qNum: 38,
      type: "Single Correct",
      text: "The derivative of sin(x) is:",
      options: ["cos(x)", "-sin(x)", "tan(x)", "sec(x)"],
    },
    {
      id: 394862,
      qNum: 39,
      type: "Multiple Correct",
      text: "For the function f(x) = x³, which of the following are true?",
      options: ["f'(x) = 3x²", "f is increasing for x > 0", "f is odd", "f(0) = 0"],
    },
    {
      id: 394863,
      qNum: 40,
      type: "Single Correct",
      text: "The integral of cos(x) dx is:",
      options: ["sin(x) + c", "-sin(x) + c", "tan(x) + c", "sec(x) + c"],
    },
    {
      id: 394864,
      qNum: 41,
      type: "Integer Type",
      text: "The number of faces in a cube is:",
      options: [],
    },
    {
      id: 394865,
      qNum: 42,
      type: "Single Correct",
      text: "The slope of the line y = 2x + 3 is:",
      options: ["2", "3", "1", "0"],
    },
    {
      id: 394866,
      qNum: 43,
      type: "Multiple Correct",
      text: "In 3D geometry, the equation of a plane is ax + by + cz = d. Which of the following are true?",
      options: ["It is linear", "It divides space into two half-spaces", "It has infinite solutions", "It is always perpendicular to the normal vector"],
    },
    {
      id: 394867,
      qNum: 44,
      type: "Single Correct",
      text: "The dot product of vectors i and j is:",
      options: ["0", "1", "-1", "2"],
    },
    {
      id: 394868,
      qNum: 45,
      type: "Integer Type",
      text: "The number of ways to select 3 items from 6 distinct items is:",
      options: [],
    },
    {
      id: 394869,
      qNum: 46,
      type: "Single Correct",
      text: "The probability of rolling a 6 on a fair die is:",
      options: ["1/6", "1/2", "1/3", "1/4"],
    },
    {
      id: 394870,
      qNum: 47,
      type: "Multiple Correct",
      text: "For the set {1,2,3}, which of the following are true?",
      options: ["It has 8 subsets", "It has 6 permutations", "It is finite", "It contains 0"],
    },
    {
      id: 394871,
      qNum: 48,
      type: "Single Correct",
      text: "The limit of (sin x)/x as x approaches 0 is:",
      options: ["1", "0", "∞", "-1"],
    },
    {
      id: 394872,
      qNum: 49,
      type: "Integer Type",
      text: "The number of edges in a tetrahedron is:",
      options: [],
    },
    {
      id: 394873,
      qNum: 50,
      type: "Single Correct",
      text: "The variance of the data 1,2,3,4,5 is:",
      options: ["2", "2.5", "3", "1"],
    },
  ];

  return (
    <div className="flex h-screen w-full bg-[#f9f9f7] text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <div
        className={cn(
          "flex-shrink-0 bg-[#f0f0ed] border-r border-slate-200 transition-all duration-300 ease-in-out hidden md:block",
          sidebarOpen ? "w-64" : "w-0"
        )}
      >
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">
              Maths Archive
            </h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {[
                "Sets, Relations & Functions",
                "Complex Numbers",
                "Quadratic Equations",
                "Matrices & Determinants",
                "Permutations & Combinations",
                "Binomial Theorem",
                "Sequences & Series",
                "Limits, Continuity & Differentiability",
                "Application of Derivatives",
                "Integrals",
                "Differential Equations",
                "Coordinate Geometry",
                "3D Geometry",
                "Vector Algebra",
                "Statistics & Probability",
                "Trigonometry",
              ].map((topic, i) => (
                <button
                  key={topic}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                    i === 0
                      ? "bg-white shadow-sm text-blue-900 font-medium"
                      : "text-slate-600 hover:bg-white/50"
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
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden md:block p-1.5 hover:bg-slate-100 rounded-md text-slate-600"
            >
              <Menu size={20} />
            </button>
            <h1 className="font-semibold text-lg text-slate-800 truncate">
              JEE Mains 2023 - Paper 1
            </h1>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <Search size={18} />
            </button>
          </div>
        </header>

        {/* Sub-Header */}
        <div className="h-10 bg-slate-50 border-b border-slate-200 flex items-center justify-between px-4 text-xs text-slate-500">
          <div className="flex gap-4">
            <span className="hover:text-slate-800 cursor-pointer">Overview</span>
            <span className="hover:text-slate-800 cursor-pointer">Analytics</span>
            <span className="hover:text-slate-800 cursor-pointer font-medium text-blue-600 border-b-2 border-blue-600 h-10 flex items-center">
              Questions
            </span>
          </div>
          <span className="text-slate-400 text-[10px]">Last updated: 2 hours ago</span>
        </div>

        {/* Content Area */}
        <ScrollArea className="flex-1 bg-[#f9f9f7]">
          <div className="w-full p-2 md:p-12 md:max-w-3xl md:mx-auto space-y-8 pb-64 overflow-x-hidden">
            {/* Question 1 */}
            <article className="bg-white p-6 md:p-8 rounded-sm shadow-sm border border-slate-100">
              <div className="flex items-baseline justify-between mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Q.1 • Single Correct
                </span>
                <span className="text-xs font-mono text-slate-400">ID: 394821</span>
              </div>

              <div className="prose prose-slate max-w-none">
                <p className="mb-4 text-lg leading-relaxed text-slate-800">
                  A projectile is fired from the origin O at an angle of 45° with the
                  horizontal. At the highest point P of its trajectory, the radial and
                  transverse components of its acceleration with respect to P are:
                </p>

                <div className="my-6 p-4 bg-slate-50 border border-slate-100 rounded flex justify-center">
                  <img
                    src={generatedImage}
                    alt="Projectile Diagram"
                    className="max-h-64 max-w-full mix-blend-multiply opacity-90"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {[
                    "Radial: g, Transverse: 0",
                    "Radial: 0, Transverse: g",
                    "Radial: g/√2, Transverse: g/√2",
                    "Radial: g/2, Transverse: g/2",
                  ].map((opt, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 rounded border border-slate-200 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all group"
                    >
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
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Q.2 • Multiple Correct
                </span>
                <span className="text-xs font-mono text-slate-400">ID: 394825</span>
              </div>
              <div className="prose prose-slate max-w-none">
                <p className="mb-4 text-lg leading-relaxed text-slate-800">
                  A thin uniform rod of mass M and length L is hinged at one end O. It
                  is released from rest from a horizontal position. When it becomes
                  vertical:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {[
                    "The angular velocity is √(3g/L)",
                    "The angular momentum about O is M√(gL³)",
                    "The force applied by the hinge is 5Mg/2",
                    "The force applied by the hinge is 3Mg/2",
                  ].map((opt, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 rounded border border-slate-200 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all group"
                    >
                      <span className="w-6 h-6 rounded-sm border border-slate-300 flex items-center justify-center text-xs font-medium text-slate-500 group-hover:border-blue-400 group-hover:text-blue-600">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-slate-700 font-medium">{opt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            {/* Generated Questions 3 → 25 */}
            {dummyQuestions.map((q) => (
              <article
                key={q.id}
                className="bg-white p-6 md:p-8 rounded-sm shadow-sm border border-slate-100"
              >
                <div className="flex items-baseline justify-between mb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Q.{q.qNum} • {q.type}
                  </span>
                  <span className="text-xs font-mono text-slate-400">ID: {q.id}</span>
                </div>
                <div className="prose prose-slate max-w-none">
                  <p className="mb-4 text-lg leading-relaxed text-slate-800">{q.text}</p>
                  {q.type === "Integer Type" ? (
                    <div className="mt-6">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Enter your answer:
                      </label>
                      <input
                        type="number"
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter integer value"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                      {q.options.map((opt, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-3 rounded border border-slate-200 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all group"
                        >
                          <span
                            className={cn(
                              "w-6 h-6 border border-slate-300 flex items-center justify-center text-xs font-medium text-slate-500 group-hover:border-blue-400 group-hover:text-blue-600",
                              q.type === "Single Correct" ? "rounded-full" : "rounded-sm"
                            )}
                          >
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="text-slate-700 font-medium">{opt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}

            {/* Hidden Secret Trigger */}
            <div className="mt-16 pt-8 border-t border-slate-200">
              <div className="text-center space-y-4">
                <p className="text-xs text-slate-400">© 2024 PYQ Master. All rights reserved.</p>
                <p className="text-[10px] text-slate-300">
                  Questions sourced from previous year papers. For educational purposes only.
                </p>

                <button
                  onClick={trigger}
                  className="text-[10px] text-slate-300 hover:text-slate-400 transition-colors cursor-pointer"
                >
                  Terms of Service · Privacy Policy · Contact Support
                </button>

                <p className="text-[9px] text-slate-200 mt-4">v2.4.1</p>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="h-12 border-t border-slate-200 bg-white flex items-center justify-between px-4 text-sm text-slate-500">
          <button className="flex items-center gap-1 hover:text-slate-800">
            <ChevronLeft size={16} /> Previous
          </button>
          <span className="font-mono text-xs">Page 1 of 14</span>
          <button className="flex items-center gap-1 hover:text-slate-800">
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
