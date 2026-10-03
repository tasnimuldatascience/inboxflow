import { Database, putEntity, uid } from "../../packages/database/src/index.ts";
import { sandboxCatalog } from "../../packages/database/src/fixtures.ts";
import { replaceCatalog } from "../../packages/integrations/src/catalog.ts";
import { documentSchema, newBlock } from "../../packages/shared/src/index.ts";
import { hash } from "../../packages/shared/src/security.ts";
import { writeFile } from "node:fs/promises";

const org = "film-meadow-20261003";
const url = process.env.DATABASE_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw Error("An explicit local PostgreSQL endpoint is required");
const db = new Database(url);
try {
  await db.transaction(async tx => {
    const existing = (await tx.query("SELECT settings FROM organizations WHERE id=$1", [org])).rows[0];
    if (existing && existing.settings.videoProductionFixture !== true) throw Error("Refusing to reset a tenant not marked as a video fixture");
    if (existing) await tx.query("DELETE FROM organizations WHERE id=$1", [org]);
    await tx.query("INSERT INTO organizations(id,name,settings) VALUES($1,$2,$3)", [org,"Meadow & Moss", JSON.stringify({demo:true,videoProductionFixture:true,retentionDays:365,liveFlowSync:false})]);
    await tx.query("INSERT INTO memberships(organization_id,user_id,role) VALUES($1,'user-owner','owner')", [org]);
    await replaceCatalog(tx, org, sandboxCatalog());
    await putEntity(tx,org,"profile","Avery Lane",{email:"avery@example.test",consent:true,suppressed:false,properties:{favorite:"Wellness"},pseudonym:hash("profile-1")},"profile-1","active");
    await putEntity(tx,org,"subscription","Avery's daily ritual",{recipientId:"profile-1",productId:"product-1",variantId:"variant-1-1",quantity:1,plan:"monthly",nextOrder:"2026-10-15",paymentStatus:"valid",provider:"sandbox",oneTimeItems:[]},"subscription-1","active");
    await putEntity(tx,org,"form","Find your daily ritual",{name:"Find your daily ritual",questions:[{id:"goal",label:"What would you like more of?",type:"single",required:true,options:["Energy","Calm","Balance"],profileProperty:"wellness_goal"},{id:"routine",label:"Tell us about your evening routine",type:"short",required:true,options:[],showWhen:{questionId:"goal",equals:"Calm"},profileProperty:"evening_routine"}],success:"Your next ritual starts here. Thank you!",outcomes:[{questionId:"goal",equals:"Calm",result:"Try our Sleep botanical ritual."}]},"form-ritual","published");
    for (const [id,name,type] of [["template-film-welcome","Your daily ritual starts here","product-grid"],["template-film-delivery","Your next delivery, your way","subscription"],["template-film-review","Little feedback. Big difference.","review"]] as const) {
      const document=documentSchema.parse({name,subject:name,preheader:"A little moment, made for you.",blocks:[{...newBlock("hero",id+"-hero"),content:name,style:{...newBlock("hero").style,background:"#e6eddc",fontSize:38}},{...newBlock("paragraph",id+"-text"),content:"Thoughtfully made essentials. Discover your next daily favorite."},{...newBlock(type,id+"-main"),productIds:["product-1","product-2","product-3"]},newBlock("footer",id+"-footer")]});
      await tx.query("INSERT INTO templates(organization_id,id,name,document) VALUES($1,$2,$3,$4)",[org,id,name,JSON.stringify(document)]);
      await tx.query("INSERT INTO template_versions(organization_id,template_id,revision,document) VALUES($1,$2,1,$3)",[org,id,JSON.stringify(document)]);
      await putEntity(tx,org,"campaign",name,{templateId:id,trigger:"Welcome series",eligible:{consent:true},provider:"sandbox"},"campaign-"+id,"draft");
    }
    await putEntity(tx,org,"flow","Avery's welcome journey",{trigger:"Welcome series",templateId:"template-film-welcome",eligibility:{consent:true,status:"active"},provider:"sandbox"},"flow-film-welcome","draft");
    await putEntity(tx,org,"provider-template","Meadow welcome",{html:"<h1>Your daily ritual starts here</h1><p>Thoughtfully made essentials.</p>",version:1,updatedBy:"sandbox"},"provider-template-1","draft");
    await putEntity(tx,org,"billing","Growth sandbox",{plan:"growth",status:"trialing",trialEnds:"2026-10-17",mode:"sandbox"},"billing-main","active");
    for (let day=0;day<28;day++) for(let person=0;person<8;person++) {
      const recipient=hash("fictional-recipient-"+person),message=`fixture-${day}-${person}`;
      for(const [index,event] of ["email_sent",...(person<5?["product_selected"]:[]),...(person===0?["purchase_confirmed"]:[])].entries()) await tx.query("INSERT INTO events(organization_id,id,recipient_id,event_type,template_id,message_id,campaign_id,revenue,demo,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10)",[org,uid(),recipient,event,"template-film-welcome",message,"campaign-template-film-welcome",event==="purchase_confirmed"?2400+day*25:0,new Date(Date.UTC(2026,8,day+5,12,index)),JSON.stringify({seeded:true})]);
    }
  });
  await writeFile("video-production/assets/fixture.json",JSON.stringify({organizationId:org,brand:"Meadow & Moss",recipientName:"Avery Lane",synthetic:true,product:"Daily greens",expectedSubscriptionBefore:"2026-10-15",expectedSubscriptionAfter:"2026-10-22"},null,2));
  console.log("Prepared an isolated synthetic film tenant, products, templates, subscription, form, and explicitly fictional historical metrics.");
} finally { await db.close(); }
