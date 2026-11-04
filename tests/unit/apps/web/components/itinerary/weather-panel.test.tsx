import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it } from "vitest";
import { WeatherPanel } from "../../../../../../apps/web/components/itinerary/WeatherPanel";
import type { Itinerary, TripWeather } from "@travel/types";
const base={city_slug:"da-nang",date:"2027-06-01",timezone:"Asia/Ho_Chi_Minh",source:"NASA POWER",source_url:"https://power.larc.nasa.gov/"};
function markup(weather: TripWeather[]) {return renderToStaticMarkup(<WeatherPanel plan={{city_catalog:{"da-nang":{name:{en:"Da Nang",vi:"Đà Nẵng"},country:"VN",timezone:"Asia/Ho_Chi_Minh"}},weather} as Itinerary}/>);}
describe("weather presentation",()=>{
 it("distinguishes climate normals from travel-date forecasts",()=>{const html=markup([{...base,status:"climate",climate_period:"2001–2020",temperature_min:24,temperature_max:33,precipitation_mm:5}]);expect(html).toContain("Monthly climate normals (2001–2020)");expect(html).toContain("travel-date forecast unavailable");expect(html).toContain("NASA POWER");expect(html).toContain("Da Nang");});
 it("shows missing data without inventing zero temperatures",()=>{const html=markup([{...base,status:"unavailable"}]);expect(html).toContain("Weather unavailable");expect(html).not.toContain("°C");});
 it("marks undated plans as reference weather and partial forecasts",()=>{const html=markup([{...base,status:"forecast",reference_only:true,partial:true,source:"MET Norway",temperature_min:24,temperature_max:30}]);expect(html).toContain("Today for reference");expect(html).toContain("Partial day");expect(html).toContain("CC BY 4.0");});
});
