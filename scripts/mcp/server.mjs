import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js'
import {callTool,toolDefinitions} from '../agent-client.mjs'
const server=new Server({name:'learnplat',version:'1.0.0'},{capabilities:{tools:{}}})
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:toolDefinitions}))
server.setRequestHandler(CallToolRequestSchema,async({params})=>{
  try {
    const data=await callTool(params.name,params.arguments||{})
    return {content:[{type:'text',text:JSON.stringify(data)}]}
  }catch(e){return {isError:true,content:[{type:'text',text:e.message}]}}
})
await server.connect(new StdioServerTransport())
