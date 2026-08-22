import LockerBox from "../components/lockerBox";
import "./locker.css";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import BgLocker2 from "../assets/BGlocker2.png"; 

function Locker() {
  const navigate = useNavigate();

  useEffect(() => {
    const username = sessionStorage.getItem("username");
    if (!username) {
      navigate("/");
    }
  }, [navigate]);

  return (
    <div className="locker-container relative overflow-hidden" >

      <img 
        src={BgLocker2} 
        alt="background" 
        className="absolute inset-0 w-full h-full object-cover z-[-1] blur-sm opacity-80" 
      />
      <button className="btn-back-home" onClick={() => navigate("/dashboard")}>
        Back to Dashboard
      </button>
      <LockerBox />
    </div>
  )
}
export default Locker;
