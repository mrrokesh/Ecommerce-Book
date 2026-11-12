import { Router } from 'express';
import { deliveryQuote } from '../domain/settings.js';
const router=Router();
router.get('/:pin',async(req,res)=>{
 try {const d=await deliveryQuote(req.params.pin,0);res.json({success:true,data:{...d,pincode:req.params.pin,message:'Delivery in approximately '+d.etaDays+' days'}});}
 catch(e){res.status(400).json({success:false,error:e.message});}
});
export default router;
