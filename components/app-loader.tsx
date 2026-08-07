"use client"

import { useEffect, useRef, useState } from "react"
import { useHydrated } from "@/hooks/use-hydrated"

const loadingMessages = [
  "Warming up our debate muscles...",
  "Grabbing our thinking caps...",
  "Sharpening our comebacks...",
  "Loading our facts...",
  "Stretching our imagination...",
  "Charging our brain batteries...",
  "Getting ready to chat...",
  "Loading cool ideas...",
  "Waking up our brain cells...",
  "Flexing our mind muscles...",
  "Loading awesome comebacks...",
  "Catching wild ideas...",
  "Cooking up some hot takes...",
  "Hyping up the crowd...",
  "Waking up the sleepy facts...",
  "Getting our game face on...",
  "Practicing our awards dance moves...",
  "Arranging the virtual debate podiums...",
  "Polishing debate trophies...",
  "Organizing tournament brackets...",
  "Tuning the timers for precision...",
  "Synchronizing judging scorecards...",
  "Setting up virtual debating rooms...",
  "Configuring real-time feedback systems...",
  "Warming up the audience...",
  "Preparing argument flowcharts...",
  "Double-checking debate formats...",
  "Summoning the spirit of Lincoln-Douglas...",
  "Gathering the world's best debaters...",
  "Fact-checking with Gemini AI...",
]

export default function AppLoader() {
  // Picked on the device: choosing during the first render would give the
  // server and the client different text and break hydration.
  const hydrated = useHydrated()
  const [rotation, setRotation] = useState(0)
  const [seed] = useState(() => Math.random())

  const message = hydrated
    ? loadingMessages[Math.floor((seed + rotation * 0.37) * loadingMessages.length) % loadingMessages.length]
    : ""
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const startRotation = () => {
      intervalRef.current = setInterval(() => setRotation(step => step + 1), 1500)
    }

    const timeout = setTimeout(startRotation, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      clearTimeout(timeout)
    }
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="w-48 h-48 relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 53 53"
          className="w-full h-full animate-pulse"
          style={{
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }}
        >
          <g>
            <path
              d="M26.4978943,50.5c2.1499634,0,3.9799805-1.3400269,4.7099609-3.2300415h-9.4199829   C22.5278625,49.1599731,24.3478699,50.5,26.4978943,50.5z"
              className="fill-[#F5AE73]"
            >
              <animate
                attributeName="fill"
                values="#F5AE73;#EF5F00;#F5AE73"
                dur="2s"
                repeatCount="indefinite"
                begin="0s"
              />
            </path>
            <path
              d="M33.3778992,37.1882935H19.6220398c-1.2052002,0-2.182251,0.9770508-2.182251,2.182312v0.1774292   c0,1.2052612,0.9770508,2.182312,2.182251,2.182312c-1.2052002,0-2.182251,0.9770508-2.182251,2.182251v0.1774292   c0,1.2052612,0.9770508,2.182312,2.182251,2.182312h13.7558594c1.2052612,0,2.182312-0.9770508,2.182312-2.182312v-0.1774292   c0-1.2052002-0.9770508-2.182251-2.182312-2.182251c1.2052612,0,2.182312-0.9770508,2.182312-2.182312v-0.1774292   C35.5602112,38.1653442,34.5831604,37.1882935,33.3778992,37.1882935z"
              className="fill-[#F5AE73]"
            >
              <animate
                attributeName="fill"
                values="#F5AE73;#A07553;#F5AE73"
                dur="2s"
                repeatCount="indefinite"
                begin="0.5s"
              />
            </path>
            <path
              d="M41.4927063,3.61676c-4.6729126,0-8.4609985,3.0321047-8.4609985,6.7720337   c0,1.5010376,0.6126099,2.885437,1.6432495,4.0072632c0.09375,0.1021118,0.1237793,0.2449341,0.0643311,0.3701782   c-0.2454834,0.5172119-0.5784912,1.1141968-0.9990845,1.6239014c-0.1797485,0.2178345-0.0367432,0.5477295,0.2454834,0.5567627   c0.7739868,0.0247192,2.0320435-0.0490723,3.0669556-0.6467285c0.0923462-0.0533447,0.2003174-0.0614624,0.2972412-0.0170898   c1.2208862,0.5584717,2.6374512,0.8696899,4.1428223,0.8696899c4.6809692,0,8.4691162-3.0240479,8.4691162-6.7639771   S46.1736755,3.61676,41.4927063,3.61676z M42.0621033,13.4882813h-5.3291016c-0.2763672,0-0.5-0.2236328-0.5-0.5   s0.2236328-0.5,0.5-0.5h5.3291016c0.2763672,0,0.5,0.2236328,0.5,0.5S42.3384705,13.4882813,42.0621033,13.4882813z    M46.9878845,10.8857422H36.7330017c-0.2763672,0-0.5-0.2236328-0.5-0.5s0.2236328-0.5,0.5-0.5h10.2548828   c0.2763672,0,0.5,0.2236328,0.5,0.5S47.2642517,10.8857422,46.9878845,10.8857422z M46.9878845,8.2841797H36.7330017   c-0.2763672,0-0.5-0.2236328-0.5-0.5s0.2236328-0.5,0.5-0.5h10.2548828c0.2763672,0,0.5,0.2236328,0.5,0.5   S47.2642517,8.2841797,46.9878845,8.2841797z"
              className="fill-[#F5AE73]"
            >
              <animate
                attributeName="fill"
                values="#F5AE73;#EF5F00;#F5AE73"
                dur="2s"
                repeatCount="indefinite"
                begin="0.25s"
              />
            </path>
            <path
              d="M37.2463684,17.3291016c-1.046875,0.5087891-2.1972656,0.6220703-3.0107422,0.6220703l-0.28125-0.0048828   c-0.515625-0.0175781-0.9648438-0.3183594-1.1748047-0.7851563c-0.2119141-0.4697266-0.1386719-1.0087891,0.1894531-1.4072266   c0.2304688-0.2792969,0.4550781-0.6240234,0.6699219-1.0253906c-1.0537109-1.2841797-1.6074219-2.7753906-1.6074219-4.3398438   c0-2.1450806,1.0637207-4.0897217,2.7803955-5.4973145c-2.2149658-1.374634-4.770752-2.2352297-7.4988403-2.371094   c-8.737854-0.4351807-16.0228882,6.1932983-16.6806641,14.6688843c0.2885742-0.0218506,0.5797119-0.036377,0.8751221-0.036377   c5.2167969,0,9.4609375,3.4863281,9.4609375,7.7714844c0,1.5644531-0.5537109,3.0556641-1.6074219,4.3398438   c0.2148438,0.4013672,0.4394531,0.7460938,0.6699219,1.0253906c0.328125,0.3984375,0.4013672,0.9375,0.1894531,1.4072266   c-0.2099609,0.4667969-0.6591797,0.7675781-1.1748047,0.7851563l-0.28125,0.0048828   c-0.3460083,0-0.7594604-0.0292969-1.1934814-0.09198c0.8695068,1.1813965,1.6147461,2.4476318,2.2006836,3.7952271h6.2280273   V22.5820313l-3.671875-3.671875c-0.1953125-0.1953125-0.1953125-0.5117188,0-0.7070313s0.5117188-0.1953125,0.7070313,0   l3.4649048,3.4649048l3.4657593-3.4649048c0.1953125-0.1953125,0.5117188-0.1953125,0.7070313,0s0.1953125,0.5117188,0,0.7070313   l-3.6728516,3.671875v13.6079712h6.2120972c0.9995728-2.3999023,2.5457764-4.5235596,4.4158936-6.34729   c3.0350952-2.9595337,4.8676758-7.1314087,4.7797241-11.7283936c-0.3013306,0.0238037-0.6060791,0.0380249-0.914856,0.0380249   C40.0032043,18.1523438,38.5422668,17.8681641,37.2463684,17.3291016z"
              className="fill-[#F5AE73]"
            >
              <animate
                attributeName="fill"
                values="#F5AE73;#A07553;#F5AE73"
                dur="2s"
                repeatCount="indefinite"
                begin="0.75s"
              />
            </path>
            <path
              d="M19.2597961,30.9257202c-0.4205933-0.5097046-0.7536011-1.1066895-0.9990845-1.6239014   c-0.0594482-0.1252441-0.02948-0.2680054,0.0643311-0.3701172c1.0306396-1.1218872,1.6432495-2.5062256,1.6432495-4.0073242   c0-3.7399292-3.7880859-6.7720337-8.4610596-6.7720337c-4.6809082,0-8.4690552,3.0321045-8.4690552,6.7720337   s3.788147,6.7639771,8.4690552,6.7639771c1.5054321,0,2.9219971-0.3112183,4.1428833-0.8696899   c0.0969238-0.0443726,0.204895-0.0362549,0.2972412,0.0170898   c1.0349121,0.5977173,2.2929688,0.6714478,3.0668945,0.6467285   C19.2964783,31.4734497,19.4395447,31.1435547,19.2597961,30.9257202z M11.1392517,28.0234375H6.0122986   c-0.2763672,0-0.5-0.2236328-0.5-0.5s0.2236328-0.5,0.5-0.5h5.1269531c0.2763672,0,0.5,0.2236328,0.5,0.5   S11.4156189,28.0234375,11.1392517,28.0234375z M16.2662048,25.421875H6.0122986c-0.2763672,0-0.5-0.2236328-0.5-0.5   s0.2236328-0.5,0.5-0.5h10.2539063c0.2763672,0,0.5,0.2236328,0.5,0.5S16.542572,25.421875,16.2662048,25.421875z    M16.2662048,22.8203125H6.0122986c-0.2763672,0-0.5-0.2236328-0.5-0.5s0.2236328-0.5,0.5-0.5h10.2539063   c0.2763672,0,0.5,0.2236328,0.5,0.5S16.542572,22.8203125,16.2662048,22.8203125z"
              className="fill-[#F5AE73]"
            >
              <animate
                attributeName="fill"
                values="#F5AE73;#EF5F00;#F5AE73"
                dur="2s"
                repeatCount="indefinite"
                begin="1s"
              />
            </path>
          </g>
        </svg>
      </div>
      <div className="mt-4 min-h-[2rem] flex items-center justify-center">
        <p
          className="text-md font-semibold text-foreground transition-opacity duration-300 text-center max-w-md"
        >
          {message || "Just a moment while we set things up..."}
        </p>
      </div>
    </div>
  );
}